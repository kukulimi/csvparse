const parse = require('./routes/parse');

module.exports = function(app) {
    parse(app);
};
