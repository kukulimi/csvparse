const crypto = require('crypto');
const mysql = require('mysql');

let connection;
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
function cleanupTable(tableName, uid) {
    const queryString = `DELETE FROM ${tableName} ` + (uid ? `where uid = '${uid}'` : ``);
    connection.query(queryString, function (error, results, fields) {
        if (error) {
            console.error('error occurred while cleaning up existing records', error);
        }
    });
}

function runQuery(queryString, record, callback) {
    if (!callback) {
        callback = function (error, results, fields) {
            if (error) {
                console.error('error occurred while cleaning up existing records', error);
            }
        }
    }
    return connection.query(queryString, record, callback);
}

module.exports = {
    prepareDatabase, cleanupTable, closeConnection, runQuery
};
