const fs = require('fs');

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

function deleteDir(path, onlySubdirs) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteDir(curPath, false);
            } else {
                fs.unlinkSync(curPath);
            }
        });

        if (!onlySubdirs) {
            fs.rmdirSync(path);
        }
    }
}

function copyFile(readFrom, writeTo) {
    return new Promise((resolve, reject) => {
        var source = fs.createReadStream(readFrom);
        var dest = fs.createWriteStream(writeTo);

        source.pipe(dest);
        source.on('end', () => resolve());
        source.on('error', () => reject());
    });
}

function getUpLoadedFiles(uploadPath, uid) {
    return fs.readdirSync(`${uploadPath}/${uid}`).map((file) => {
        return `${uploadPath}/${uid}/${file}`
    });
}

module.exports = {
    prepareDir, deleteDir, copyFile, getUpLoadedFiles
};