const Promise = require('promise');
const crypto = require('crypto');
const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });

const excel = require('../util/excel');
const fileutil = require('../util/fileutil');
const dbutil = require('../util/dbutil');

const path = require('path');

const CONSTANTS = {
    columnFilter :  { // cols to extract
        rateTemplateUpdate : [1,2,5,6,7,8,9,11,12,13,18,19,20,22,23,24,25,26,27],
        priceSeasonTemplate : [0,1,2,3,4,5,6,7,8,9,11,12,13,16],
        hotelRateAudit : [3,5,7,22,23,24,25]
    },
    tableName : {
        rateTemplateUpdate : 'rate_template_update',
        priceSeasonTemplate : 'price_season_template',
        hotelRateAudit : 'hotel_rate_audit'
    },
    noneNullColumnNm : {    // to decide when to stop reading rows
        hotelRateAudit : 5
    }
};

const DOWN_PATH = './downloads';
const UP_PATH = './uploadedfiles';

module.exports = function(app) {
    app.get('/index', (req, res) => {
        res.sendFile(path.join(__dirname + '/index.html'));
    });

    app.get('/success', (req, res) => {
        res.sendFile(path.join(__dirname + '/success.html'));
    });

    app.get('/clearAllExistingJobs', (req, res) => {
        fileutil.deleteDir(UP_PATH, true);
        fileutil.deleteDir(DOWN_PATH, true);
        fileutil.deleteDir('./uploads', true);  // tmp uploaded files
        try {
            dbutil.prepareDatabase();
            Object.values(CONSTANTS.tableName).forEach((tableName) => {
                dbutil.cleanupTable(tableName);
            });
        } catch (e) {
            console.error('failed to clear db', e);
        } finally {
            dbutil.closeConnection();
        }

        res.send('done');
    });

    app.post('/upload', upload.array('file1', 3), function(req, res) {
        if (!req.files) {
            return res.status(400).send('No files were uploaded.');
        }
        try {
            let uid = crypto.randomBytes(5).toString('hex');
            fileutil.prepareDir(`${UP_PATH}/${uid}`);
            Promise.all(req.files.map(file =>
                fileutil.copyFile(`${file.destination}${file.filename}`, `${UP_PATH}/${uid}/${file.originalname}`)
            )).then(() => res.redirect('/start?uid=' + uid));

        } catch (e) {
            console.error(e);
            res.redirect('/index?error=true');
        }
    });

    app.get('/start', (req, res) => {
        const uid = req.query.uid;
        if (!uid) {
            return res.status(400).send('uid should be provided.');
        }
        const files = fileutil.getUpLoadedFiles(UP_PATH, uid);
        Promise.all(files.map(file => {
            const fileType = getFileTypeByName(file);
            const data = excel.readExcelSheet(file, fileType);
            const filteredData = filterCols(data, fileType);
            return insertRecordsToTable(filteredData, CONSTANTS.tableName[fileType], uid);
        })).then((uid) => {
            // console.log('get reports from db.. with uid : ', uid[0]);
            selectReport(uid[0]).then(() => {
                res.download(`./downloads/report_${uid[0]}.xlsx`);
                fileutil.deleteDir(`${UP_PATH}/${uid[0]}`, false);
                try {
                    dbutil.prepareDatabase();
                    Object.values(CONSTANTS.tableName).forEach((tableName) => {
                        dbutil.cleanupTable(tableName, uid[0]);
                    });
                } catch (e) {
                    console.error('failed to clear db', e);
                } finally {
                    dbutil.closeConnection();
                }
            });
        });
    });
};

function getFileTypeByName(filename) {
    let type;
    if (filename.includes('RateTemplateUpdate')) {
        type = 'rateTemplateUpdate';
    } else if (filename.includes('Price')) {
        type = 'priceSeasonTemplate';
    } else if (filename.includes('Stay')) {
        type = 'stayRestriction';
    } else {
        type = 'hotelRateAudit';
    }
    return type;
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
function insertRecordsToTable(tableData, tableName, uid) {
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
            dbutil.prepareDatabase();
            dbutil.cleanupTable(tableName, uid);

            // current mysql npm module seems to have issue with bulk inserts...
            // const colNames = columns.map(colNm => toIdentifier(colNm).toLowerCase());
            // var query = connection.query(`INSERT INTO ${tableName} (${colNames}) VALUES ?`, records, function (error, results, fields) {
            //     if (error) {
            //         throw error;
            //     }
            // });
            // console.log(query.sql);

            Promise.all(records.map((record) => {
                record[`uid`] = uid;
                return new Promise((resolve, reject) => {
                    var query = dbutil.runQuery(`INSERT INTO ${tableName} SET ?`, record);
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
                resolve(uid);
            });

        } catch (e) {
            console.error('something went wrong');
            console.log(e);
            reject();
        } finally {
            dbutil.closeConnection();
        }
    });
}

function selectReport(uid) {
    return new Promise((resolve, reject) => {
        dbutil.prepareDatabase();

        const queryString =
            'select rta.hotel_id, rta.rate_code, hra.property_hotel_name, rta.rate_type_class_code, rta.currency_code, rta.rate_type_name, ' +
            '    rta.default_short_description, rta.default_long_description, rta.active,rta.negotiated, rta.include_tax_by_default, ' +
            '    rta.commission_policy, rta.default_guarantee_policy, rta.default_cancel_policy, rta.breakfast_included_in_rate, ' +
            '    rta.meal_plan, rta.rate_category_code, rta.derive_type, rta.derive_rate_code, rta.default_price, ' +
            '    pst.start_day, pst.start_month, pst.start_year, pst.end_day, pst.end_month, pst.end_year, pst.no_end_date,' +
            '    pst.room_code, pst.base_price, pst.derived_formula, pst.factor, pst.include_tax_by_default,' +
            '    hra.mapping_amadeus, hra.mapping_galileo, hra.mapping_sabre, hra.mapping_worldspan' +
            '    from price_season_template pst ' +
            'left outer join rate_template_update rta on rta.hotel_id = pst.hotel_id and rta.rate_code = pst.rate_code and rta.uid = pst.uid ' +
            'left outer join hotel_rate_audit hra on rta.hotel_id = hra.property_hotel_id and rta.rate_code = hra.codes_redx_rate_type_code and hra.uid = pst.uid ' +
            `where pst.uid = ? order by rta.hotel_id;`;
        try {
            let query = dbutil.runQuery(queryString, uid, function (error, results, fields) {
                if (error) {
                    throw error;
                }
                fileutil.prepareDir(DOWN_PATH);
                excel.writeToFile(DOWN_PATH, results, uid);
            });

            query.on('error', function(err) {
                    console.log(err);
                    reject('some records failed to insert');
                }).on('end', function() {
                    resolve('success');
                });
        } catch (e) {
            console.error('something went wrong');
            console.log(e);
            reject('success');
        } finally {
            dbutil.closeConnection();
        }
    });
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
