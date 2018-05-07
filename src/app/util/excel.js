const xlsx = require('xlsx');

const CONSTANTS = {
    sheetName : {   // sheet will be selected by it's name
        rateTemplateUpdate : 'Rate Configuration',
        priceSeasonTemplate : 'Pricing Formulas',
        hotelRateAudit : 'HotelRateAudit'
    },
    excelSheetStartRange : {
        hotelRateAudit : {s:{c:2, r:6}, e:{c:31}} // data starts in 3rd col and 7th row. can't define end row as it differs
    }
};

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

function writeToFile(downloadPath, results, uid) {
    const filename = `report_${uid}.xlsx`;
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
    xlsx.writeFile(wb, `${downloadPath}/${filename}`);
}

module.exports = {
    readExcelSheet, writeToFile
};