# comlog-ftp [![NPM version](https://badge.fury.io/js/comlog-ftp.svg)](https://npmjs.org/package/comlog-ftp) [![Build Status](https://travis-ci.org/ar/comlog-ftp.svg?branch=master)](https://travis-ci.org/ar/comlog-ftp)

> FTP Client with encoding support

## Installation

```sh
$ npm install --save comlog-ftp
```

## Usage Simple way

```js
var FTPClient = require('comlog-ftp');

var conn = FTPClient({
    host: 'localhost', // Default localhost
    port: 21, // Default 12
    user: 'username', // Default anonymous
    password: 'password' // Default anonymous@
});

conn.connect(function(err) {
  if (err) return console.error(err);
  
  conn.get('/some_filename.txt', 'c:\\some_filename.txt', function(err) {
     if (err) return console.error(err);
     console.info('Download Success!');
  });
});
````

## Usage Adwanced way
```js
var FTPClient = require('comlog-ftp');

var conn = FTPClient({
    host: 'localhost', // Default localhost
    port: 21, // Default 12
    user: 'username', // Default anonymous
    password: 'password' // Default anonymous@
});

conn.on('error', function(err) {
  console.error(err);
});

// Optional custom data handling
conn.on('data', function(data) {
	// custom socket data handling
});

// Optional custom on connect handling
conn.on('connect', function(data) {
	// socket connected
});

// Optional custom code 220 handling (all ftp codes can be used)
this.on('220', function (chunk) {
    this.write('USER ' + this.user, function(){});
});

conn.on('ready', function() {
    conn.get('/some_filename.txt', 'c:\\some_filename.txt', function(err) {
       if (err) return console.error(err);
       console.info('Download Success!');
    });
    // OR
    conn.raw('ALLO', function(response) {
        console.info(response);
    })
});

// Open connection
conn.connect();
```

## Functions
 - connect( callback ) void
 - write( command, [callback] ) void
 - raw( command, [args], callback ) void
 - feat( callback ) void
 - list( callback ) void
 - get( removeFilePath, [localFilePath], callback ) void
 - put( localFilePath, [removeFilePath], callback ) void
 - cwd( remotePath, callback ) void
 - pwd( callback ) void
 - rename( remoteFromPath, remoteToPath, callback) void
 - delete( remoteFilePath, callback ) void
 - mkdir( remotePath, callback ) void
 - rmdir( remoteDir, callback ) void
 - stat( callback ) void
 - destroy() void

## Properties
 - {int} port Default: 21
 - {String} host Default: "localhost"
 - {String} user Default: "anonymous"
 - {String} password Default: "anonymous@"
 - {boolean} active Default: false
 - {int} timeout Default: 10 * 60 * 1000
 - {String} encoding Default: 'binary' Available: ascii,utf8,utf16le,ucs2,base64,latin1,binary,hex
 - {String} type Default: 'I'
 - {net.Socket} Socket Control channel socket. Default: null
 - {boolean} debug Default: false

## CHANGELOG
 - BUG Encoding after Download

## License

ISC © [COMLOG GmbH](http://www.comlog.org)
