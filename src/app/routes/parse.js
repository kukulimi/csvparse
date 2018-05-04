const Promise = require('promise');
const xlsx = require('xlsx');
const mysql = require('mysql');
const fs = require('fs');
const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });
var path = require('path');

const CONSTANTS = {
    columnFilter :  { // cols to extract
        rateTemplateUpdate : [1,2,5,6,7,8,9,11,12,13,18,19,20,22,23,24,25,26,27],
        priceSeasonTemplate : [0,1,2,3,4,5,6,7,8,9,11,12,13,16],
        hotelRateAudit : [3,5,7,22,23,24,25]
    },
    sheetName : {   // sheet will be selected by it's name
        rateTemplateUpdate : 'Rate Configuration',
        priceSeasonTemplate : 'Pricing Formulas',
        hotelRateAudit : 'HotelRateAudit'
    },
    tableName : {
        rateTemplateUpdate : 'rate_template_update',
        priceSeasonTemplate : 'price_season_template',
        hotelRateAudit : 'hotel_rate_audit'
    },
    excelSheetStartRange : {
        hotelRateAudit : {s:{c:2, r:6}, e:{c:31}} // data starts in 3rd col and 7th row. can't define end row as it differs
    },
    noneNullColumnNm : {    // to decide when to stop reading rows
        hotelRateAudit : 5
    }
};

const DOWN_PATH = './downloads';
const UP_PATH = './uploadedfiles';

let connection;

module.exports = function(app) {
    app.get('/index', (req, res) => {
        res.sendFile(path.join(__dirname + '/index.html'));
    });

    app.get('/success', (req, res) => {
        res.sendFile(path.join(__dirname + '/success.html'));
    });

    app.post('/upload', upload.array('file1', 3), function(req, res) {
        console.log(req.files); // the uploaded file object

        if (!req.files) {
            return res.status(400).send('No files were uploaded.');
        }
        try {
            prepareDir(UP_PATH);
            Promise.all(req.files.map(file => {
                return new Promise((resolve, reject) => {
                    var source = fs.createReadStream(`${file.destination}${file.filename}`);
                    var dest = fs.createWriteStream(`${UP_PATH}/${file.originalname}`);

                    source.pipe(dest);
                    source.on('end', () => resolve());
                    source.on('error', () => reject());
                });
            })).then(() => res.redirect('/success'));


        } catch (e) {
            console.error(e);
            res.redirect('/index?error=true');
        }
    });

    app.get('/start', (req, res) => {
        const files = getUpLoadedFiles();

        Promise.all(files.map(file => {
            const fileType = getFileTypeByName(file);
            const data = readExcelSheet(file, fileType);
            const filteredData = filterCols(data, fileType);
            return insertRecordsToTable(filteredData, CONSTANTS.tableName[fileType]);
        })).then(() => {
            selectReport().then(() => {
                res.download('./downloads/report.xlsx');
            });
        });
    });
};

function getUpLoadedFiles() {
    return fs.readdirSync(UP_PATH).map((file) => {
        return `${UP_PATH}/${file}`
    });
}

/**
 * Read excel sheet by given sheet name
 * @param filename
 * @param sheetNm
 * @returns {*}
 */
function readExcelSheet(filename, fileType) {
    const sheetNm = CONSTANTS.sheetName[fileType];
    const workbook = xlsx.readFile(filename, {});
    const sheet = workbook.Sheets[sheetNm];
    return readTable(sheet, fileType);
}

function getFileTypeByName(filename) {
    let type;
    if (filename.includes('RateTemplateUpdate')) {
        type = 'rateTemplateUpdate';
    } else if (filename.includes('Price')) {
        type = 'priceSeasonTemplate';
    } else {
        type = 'hotelRateAudit';
    }
    return type;
}

/**
 * Read sheet and compute to [][]
 * @param sheet
 * @returns {string[][]}
 */
function readTable(sheet, fileType) {
    let range = decodeRange(sheet['!ref']);
    const customRange = CONSTANTS.excelSheetStartRange[fileType];
    const startCol = (customRange && customRange.s && customRange.s.c) ? customRange.s.c : range.s.c;
    const endCol = (customRange && customRange.e && customRange.e.c) ? customRange.e.c : range.e.c;

    const startRow = (customRange && customRange.s && customRange.s.r) ? customRange.s.r : range.s.r;
    const endRow = (customRange && customRange.e && customRange.e.r) ? customRange.e.r : range.e.r;
    const columns = createRange(startCol, endCol + 1).map(encodeCol);
    return createRange(startRow, endRow + 1).map(rowIndex => {
        const rowEncoding = encodeRow(rowIndex);
        return columns.map(colEncoding => formatCell(sheet[colEncoding + rowEncoding]));
    });
}

/**
 * Extract only cols that are needed
 * @param data
 * @param fileType
 * @returns {*}
 */
function filterCols(data, fileType){
    const includedColsNm = CONSTANTS.columnFilter[fileType];
    const nonNullColNm = CONSTANTS.noneNullColumnNm[fileType];
    let filteredData = data.map(record => {
        return record.filter((item, idx) => {
            return includedColsNm.includes(idx);
        });
    });
    if (nonNullColNm) {
        filteredData = filteredData.filter((record) => {
            return !!record[nonNullColNm];
        });
    }
    return filteredData;
}

/**
 * Insert records - Bulk insert doesn't seem to be working with current mysql module... I
 * Insert records using loops and resolve promise when all done.
 * @param tableData
 * @param tableName
 * @returns {*|Promise}
 */
function insertRecordsToTable(tableData, tableName) {
    return new Promise((resolve, reject) => {
        const [columns, ...rows] = tableData;
        let records = rows.map(row => {
            return row.reduce((rsltObj, itm, idx) => {
                const columnName = toIdentifier(columns[idx]).toLowerCase();
                rsltObj[columnName] = itm;
                return rsltObj;
            }, {});
        });

        try {
            prepareDatabase();
            cleanupTable(tableName);

            // current mysql npm module seems to have issue with bulk inserts...
            // const colNames = columns.map(colNm => toIdentifier(colNm).toLowerCase());
            // var query = connection.query(`INSERT INTO ${tableName} (${colNames}) VALUES ?`, records, function (error, results, fields) {
            //     if (error) {
            //         throw error;
            //     }
            // });
            // console.log(query.sql);

            Promise.all(records.map((record) => {
                return new Promise((resolve, reject) => {
                    var query = connection.query(`INSERT INTO ${tableName} SET ?`, record, function (error, results, fields) {
                        if (error) {
                            throw error;
                        }
                    });
                    query
                        .on('error', function(err) {
                            // Handle error, an 'end' event will be emitted after this as well
                            console.log(err);
                            reject('some records failed to insert');
                        })
                        .on('end', function() {
                            // all rows have been received
                            resolve();
                        });
                });
            })).then(() => {
                resolve();
            });

        } catch (e) {
            console.error('something went wrong');
            console.log(e);
            reject();
        } finally {
            closeConnection();
        }
    });
}

function selectReport() {
    return new Promise((resolve, reject) => {
        prepareDatabase();

        const query =
            'select rta.*,' +
            '    pst.start_day,' +
            '    pst.start_month,' +
            '    pst.start_year,' +
            '    pst.end_day,' +
            '    pst.end_month,' +
            '    pst.end_year,' +
            '    pst.no_end_date,' +
            '    pst.room_code,' +
            '    pst.base_price,' +
            '    pst.derived_formula,' +
            '    pst.factor,' +
            '    pst.include_tax_by_default,' +
            '    hra.property_hotel_name,' +
            '    hra.mapping_amadeus,' +
            '    hra.mapping_galileo,' +
            '    hra.mapping_sabre,' +
            '    hra.mapping_worldspan' +
            '    from price_season_template pst ' +
            'left outer join rate_template_update rta on rta.hotel_id = pst.hotel_id and rta.rate_code = pst.rate_code ' +
            'left outer join hotel_rate_audit hra on rta.hotel_id = hra.property_hotel_id and rta.rate_code = hra.codes_redx_rate_type_code ' +
            'order by rta.hotel_id;';
        try {
            connection.query(query, function (error, results, fields) {
                if (error) {
                    throw error;
                }
                writeToFile(results);
                resolve('success');
            });
        } catch (e) {
            console.error('something went wrong');
            console.log(e);
            reject('success');
        } finally {
            closeConnection();
        }
    });
}

/**
 * Cleanup directory
 * @param path
 */
function prepareDir(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    } else {
        fs.readdirSync(path).forEach(function(file, index){
            var curPath = path + "/" + file;
            fs.unlinkSync(curPath);
        });
    }
}

function writeToFile(results) {
    const filename = 'report.xlsx';
    prepareDir(DOWN_PATH);
    const data =results.reduce((arr, result, idx) => {
        if (idx === 0) {
            arr.push(Object.keys(result));
        }
        arr.push(Object.values(result));
        return arr;
    }, []);

    const ws_name = "Report";
    const wb = xlsx.utils.book_new(), ws = xlsx.utils.aoa_to_sheet(data);

    xlsx.utils.book_append_sheet(wb, ws, ws_name);
    xlsx.writeFile(wb, `${DOWN_PATH}/${filename}`);

    // TODO : this is for later... separate file by each hotel or channel
    // const allDataByHotel = results.reduce((dataByHotel, result, idx) => {
    //     if (!dataByHotel[result['hotel_id']]) {
    //         // push column names for the first record
    //         dataByHotel[result['hotel_id']] = [];
    //         dataByHotel[result['hotel_id']].push(Object.keys(result));
    //     }
    //
    //     dataByHotel[result['hotel_id']].push(Object.values(result));
    //     return dataByHotel;
    // }, {});

    // allDataByHotel.map((hotelData => {
    //     const hotel_id = Object.keys(hotelData)[0];
    //     const ws_name = `Report_${hotel_id}`;
    //     const wb = xlsx.utils.book_new(), ws = xlsx.utils.aoa_to_sheet(hotelData);
    //
    //     xlsx.utils.book_append_sheet(wb, ws, ws_name);
    //     xlsx.writeFile(wb, `${downloadPath}/${filename}_${hotel_id}`);
    // }));
}

/**
 * Create column name
 * @param input
 * @returns {string}
 */
function toIdentifier(input) {
    return input
        // replace # with 'id'
        .replace(/#/g, 'id')
        // replace illegal characters with whitespace
        .replace(/\W+/g, ' ')
        .trim()
        // replace whitespace with underscores
        .replace(/\s+/g, '_');
}

/**
 *
 * @param tableData
 */
function prepareDatabase() {
    if (connection && connection.state !== 'disconnected') {
        try {
            connection.end();
        } catch (e) {
            console.error('error closing existing connection.. creating additional connection.. ');
        }
    }

    connection = mysql.createConnection({
        host     : 'localhost',
        port     : '3306',
        user     : 'siteminder',
        password : 'siteminder',
        database : 'reports'
    });

    connection.on('error', function(err) {
        console.log(err.code); // 'ER_BAD_DB_ERROR'
    });

    connection.connect();
}

function closeConnection() {
    if (connection && connection.state !== 'disconnected') {
        connection.end();
        console.log('db connection closed');
    }
}

/**
 * Delete all records before inserting new reports
 * @param tableName
 */
function cleanupTable(tableName) {
    connection.query(`DELETE FROM ${tableName}`, function (error, results, fields) {
        if (error) {
            console.error('error occurred while cleaning up existing records', error);
        }
    });
}

function createRange(start, end){
    let indices = new Array(end - start);
    for (let index = start; index < end; index++) {
        indices[index - start] = index;
    }
    return indices;
}

/*! Extracted from https://github.com/SheetJS/js-xlsx/blob/v0.8.0/xlsx.js#L11461-L11491 */
function decodeRange(range){
    var o = {s:{c:0,r:0},e:{c:0,r:0}};
    var idx = 0, i = 0, cc = 0;
    var len = range.length;
    for(idx = 0; i < len; ++i) {
        if((cc=range.charCodeAt(i)-64) < 1 || cc > 26) break;
        idx = 26*idx + cc;
    }
    o.s.c = --idx;

    for(idx = 0; i < len; ++i) {
        if((cc=range.charCodeAt(i)-48) < 0 || cc > 9) break;
        idx = 10*idx + cc;
    }
    o.s.r = --idx;

    if(i === len || range.charCodeAt(++i) === 58) { o.e.c=o.s.c; o.e.r=o.s.r; return o; }

    for(idx = 0; i != len; ++i) {
        if((cc=range.charCodeAt(i)-64) < 1 || cc > 26) break;
        idx = 26*idx + cc;
    }
    o.e.c = --idx;

    for(idx = 0; i != len; ++i) {
        if((cc=range.charCodeAt(i)-48) < 0 || cc > 9) break;
        idx = 10*idx + cc;
    }
    o.e.r = --idx;
    return o;
}

function encodeRow(row) {
    return '' + (row + 1);
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/**
 encodeCol(0)     => 'A'
 encodeCol(1)     => 'B'
 encodeCol(25)    => 'Z'
 encodeCol(26)    => 'AA'
 encodeCol(27)    => 'AB'
 encodeCol(27*26) => 'AAA'
 It's a weird arithemetic.
 */
function encodeCol(col) { //: string {
    var s = '';
    col++;
    do {
        s = alphabet[(col - 1) % 26] + s;
        col = (col - 1) / 26 | 0;
    } while (col > 0);
    return s;
}

function formatCell(cell) { //: xlsx.CellObject): string {
    if (cell === undefined) {
        return undefined;
    }
    // cell.t can be one of 'b', 'e', 'n', or 's' ('d' is only available if options.cellDates is set)
    if (cell.t == 'b') {
        // Type b is the Boolean type. v is interpreted according to JS truth tables
        return String(cell.v);
    }
    else if (cell.t == 'e') {
        // Type e is the Error type. v holds the number and w holds the common name
        return cell.w;
    }
    else if (cell.t == 'n') {
        // Type n is the Number type. This includes all forms of data that Excel stores as numbers, such as dates/times and Boolean fields. Excel exclusively uses data that can be fit in an IEEE754 floating point number, just like JS Number, so the v field holds the raw number. The w field holds formatted text.
        return String(cell.v); // or cell.w ?
    }
    else if (cell.t == 's') {
        // Type s is the String type. v should be explicitly stored as a string to avoid possible confusion.
        return cell.w ? cell.w : String(cell.v);
    }
}