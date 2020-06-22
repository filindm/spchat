'use strict';

const { URL } = require('url');


const fileNameFromURL = url => {
    try {
        return new URL(url).pathname.split('/').slice(-1)[0];
    } catch(e) {
        return '';
    }
}


module.exports = {
    fileNameFromURL,
}
