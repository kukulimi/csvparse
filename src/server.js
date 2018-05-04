const express = require("express");
const bodyParser = require("body-parser");
const fileUpload = require('express-fileupload')

const app = express();
const port = 3000;

require('./app')(app);

app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.disable('etag'); // This is to prevent cached(304 not modified) response

app.listen(port, () => {
    console.log('Listening... ' + port);
});