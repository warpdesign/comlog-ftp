const EventEmitter = require('events');
const util = require('util');
const net = require('net');
const ListingParser = require("parse-listing");
const fs = require("fs");
const stream = require("stream");

var PASV_REG = /([-\d]+,[-\d]+,[-\d]+,[-\d]+),([-\d]+),([-\d]+)/;

/**
 * @param settings
 * @constructor
 */
function FTP(settings) {
	var _this = this;
	// Event handler
	EventEmitter.call(this);

	this.port = 21;
	this.host = "localhost";
	this.user = "anonymous";
	this.password = "anonymous@";
	this.active = false;
	this.timeout = 10 * 60 * 1000;
	this.encoding = 'binary';
	this.type = 'I';
	this.Socket = null;
	this.debug = true;

	var _bindEvents = function () {
		var eventList = ['connect', 'data', 'end', 'close', 'error'];
		for(var i=0; i < eventList.length; i++) {
			(function (e) {
				_this.Socket.on(e, function () {
					_this.emit(e, arguments[0], arguments[1], arguments[2]);
				});
			})(eventList[i]);
		}
	};

	/* Send user to FTP */
	this.on('220', function (chunk) {
		this.write('USER ' + this.user, function(){});
	});

	/* Send password to FTP */
	this.on('331', function (chunk) {
		this.write('PASS ' + this.password, function(){});
	});

	/* Open Data connection */
	var _settype = function () {
		_this.write('type '+_this.type);
	};
	this.on('230', _settype);
	this.on('202', _settype);


	/* Open Data connection */
	this.on('200', function (chunk) {
		this.emit('ready');
	});

	/* session end */
	this.on('221', function (chunk) {
		// TODO session end
		this.Socket.end(null, function(){});
	});

	this.on('data', function (chunk) {
		if (this.debug) console.log(chunk);
		var code = chunk.substring(0,3);
		this.emit(code, chunk);
	});

	this.createSocket = function (host, port) {
		if (!host) host = this.host;
		if (!port) port = this.port;
		var Socket = new net.Socket();
		Socket.connect(port, host);
		return Socket;
	};

	/**
	 * Connect to FTP
	 * @param {Function} [cb] Optional use ClientObj.on('ready');
	 */
	this.connect = function(cb) {
		this.Socket = this.createSocket();
		this.Socket.setEncoding(this.encoding);
		_bindEvents();
		if (cb) {
			this.once('error', function (err) {
				if (cb) cb.call(this, err);
				cb = null;
			});
			this.once('ready', function () {
				if (cb) cb.call(this, null);
				cb = null;
			});
		}
	};

	/**
	 * Write date to Socket
	 * @param {String} cmd
	 * @param {Function} cb Callback function
	 */
	this.write = function(cmd, cb) {
		if (!cb) cb = function () {};
		this.Socket.write(cmd + '\r\n', this.encoding, cb);
	};

	/**
	 * Send raw command
	 * @param {String} cmd
	 * @param {String|Array} [args]
	 * @param {Function} cb Callback function
	 */
	this.raw = function(cmd, args, cb) {
		if (typeof args == "function") {
			cb = args;
			args = '';
		}
		if (args instanceof Array) args = args.join(' ');
		var arg_str = typeof args === 'string' && args.length > 0 ? ' '+args : '';

		this.write(cmd + arg_str, function () {
			_this.once('data', function (chunk) {
				cb(chunk);
			})
		});
	};

	this.waitFor = function(str, cb) {
		var tmp = arguments[2] || '';
		this.once('data', function (chunk) {
			tmp += chunk;
			if (chunk.indexOf(str) < 0) {
				this.waitFor(str, cb, tmp);
				return;
			}
			cb(tmp);
		});
	};

	/**
	 * Get passiv socket
	 * @param {Function} cb Callback function
	 */
	this.pasv = function (cb) {
		this.raw('PASV', function(res) {
			var match = (res+'').match(PASV_REG);
			if (match) {
				var host = match[1].split(',').join("."),
					port  = (parseInt(match[2], 10) & 255) * 256 + (parseInt(match[3], 10) & 255);

				if (host === "127.0.0.1") host = _this.host;
				_this.PassivSocket = _this.createSocket(host, port);
				_this.PassivSocket.setTimeout(_this.timeout);
				_this.PassivSocket.once("close", function() {
					_this.PassivSocket.destroy();
					delete _this.PassivSocket;
				});
				_this.PassivSocket.once('connect', function (data) {
					cb(null, _this.PassivSocket);
				});
				_this.PassivSocket.once('error', function (err) {
					var e = new Error("Can't open passiv connenction:"+err.message);
					_this.emit('error', e);
					cb(e, null);
				});
			}
			else {
				var err = new Error("Can't open passiv connenction:"+res);
				_this.emit(err);
				cb(err, null);
			}
		});
	};

	/**
	 * Get feature list
	 * @param {Function} cb Callback function
	 */
	this.feat = function (cb) {
		this.write('FEAT', function () {
			_this.waitFor('211 End', function (data) {
				var tmp = data.split("\r\n");
				tmp = tmp.splice(1, tmp.length-3);
				for(var i=0; i < tmp.length; i++) tmp[i] = tmp[i].trim();
				cb(tmp);
			});
		});
	};

	/**
	 * List all Files and Folders
	 * @param {String} dir
	 * @param {Function} cb Callback function
	 */
	this.list = function (dir, cb) {
		if (typeof dir == "function") {
			cb = dir; dir = '';
		}
		this.pasv(function (serr, psock) {
			if (psock) {
				psock.setEncoding(this.encoding);
				var data = '';
				var error = null;
				psock.on('data', function (d) {
					data += d;
				});
				psock.on('error', function (e) {
					error = e;
				});
				psock.on('close', function () {
					ListingParser.parseFtpEntries(data, function(parseErr, files) {
						cb(error || parseErr, files, data);
					});
				});
				_this.write('LIST '+(dir || ''));
			}
			else cb(serr);
		});
	};

	/**
	 * Download file from Server
	 * @param {String} src
	 * @param {String} [dst] Optional, if not set wil return Socket
	 * @param {Function} cb Callback function
	 */
	this.get = function (src, dst, cb) {
		if (typeof dst == 'function') {
			cb = dst; dst = null;
		}
		this.pasv(function (serr, psock) {
			if (psock) {
				var error = null;
				psock.setEncoding(_this.encoding);
				if (dst) {
					var writeStream;
					psock.on('error', function (err) {
						error = err;
					});


					psock.on('data', function (d) {
						if (!writeStream) {
							writeStream = fs.createWriteStream(dst);
							writeStream.on("error", function (err) {
								error = err;
							});
						}

						writeStream.write(d);
					});

					psock.on('close', function () {
						if (writeStream) writeStream.end();
						if (cb) {
							cb(error);
							cb = null;
						}
					});
					//psock.pipe(writeStream);
				}


				_this.raw('RETR',src, function (res) {
					if (res.substr(0, 3) == '550') {
						if (cb) {
							cb(new Error(res));
							cb = null;
						}
					} else if(!dst) {
						cb(null, psock);
					}
				});
			}
			else cb(serr);
		});
	};

	/**
	 * Upload file to Server
	 * @param {String|stream.Readable} src local file
	 * @param {String} dst Online file path
	 * @param {Function} cb Callback function
	 */
	this.put = function (src, dst, cb) {
		var readStream;
		if (src instanceof stream.Readable) readStream = src;
		else readStream = fs.createReadStream(src);

		readStream.on('error', function (e) {
			cb(e);
			readStream.destroy();
		});
		readStream.on('readable', function () {
			_this.pasv(function (serr, psock) {
				if (psock) {
					var error = null;
					psock.setEncoding(_this.encoding);

					psock.on('error', function (err) {
						error = err;
					});

					readStream.on('end', function () {
						psock.end();
						readStream.close();
						readStream.destroy();

					});

					psock.on('close', function () {
						if (cb) {
							cb(error);
							cb = null;
						}
					});

					readStream.pipe(psock);

					_this.raw('STOR',dst, function (res) {
						if (res.substr(0, 3) == '550') {
							if (cb) {
								cb(new Error(res));
								cb = null;
							}
						} else if(!dst) {
							cb(null, psock);
						}
					});
				}
				else cb(serr);
			});
		});
	};

	/**
	 * Change to directory
	 * @param {String} dir
	 * @param {Function} cb Callback function
	 */
	this.cwd = function (dir, cb) {
		this.raw('CWD', dir, function (data) {
			cb(data.substr(0, 3) == '550' ? new Error(data) : null);
		});
	};

	/**
	 * Get Current dir
	 * @param {Function} cb Callback function
	 */
	this.pwd = function (cb) {
		this.raw('PWD', function (data) {
			if (data.substr(0, 3) != '257') return cb(new Error(data), null);

			var start = data.indexOf('"');
			if (start < 0) return cb(new Error(data), null);

			var ende = data.indexOf('"', start+1);
			if (ende < 0) return cb(new Error(data), null);

			cb(null, data.substring(start+1, ende));
		});
	};

	/**
	 * Rename file or folder
	 * @param {String} src Path on Server rename from
	 * @param {String} dst Path on Server rename to
	 * @param {Function} cb Callback function
	 */
	this.rename = function (src, dst, cb) {
		this.raw('RNFR', src, function (data) {
			if (data.substr(0, 3) != '350') return cb(new Error(data));
			_this.raw('RNTO', dst, function (data2) {
				if (data2.substr(0, 3) != '250') return cb(new Error(data2));
				cb(null);
			});
		});
	};

	/**
	 * Delete file
	 * @param {String} target Path on server
	 * @param {Function} cb Callback function
	 */
	this.delete = function (target, cb) {
		this.raw('DELE', target, function (data) {
			if (data.substr(0, 3) != '250') return cb(new Error(data));
			cb(null);
		});
	};

	/**
	 * Create folder
	 * @param {String} target path on Server
	 * @param {Function} cb Callback function
	 */
	this.mkdir = function (target, cb) {
		this.raw('MKD', target, function (data) {
			if (data.substr(0, 3) != '257') return cb(new Error(data));
			cb(null);
		});
	};

	/**
	 * Remove folder
	 * @param {String} target Path on Server
	 * @param {Function} cb Callback function
	 */
	this.rmdir = function (target, cb) {
		this.raw('RMD', target, function (data) {
			if (data.substr(0, 3) != '250') return cb(new Error(data));
			cb(null);
		});
	};

	/**
	 * Get server status
	 * @param {Function} cb Callback function
	 */
	this.stat = function (cb) {
		this.raw('STAT', function (data) {
			if (data.substr(0, 3) == '500') return cb(new Error(data), null);
			cb(null, data);
		});
	};
	this.status = this.stat;

	/**
	 * Close Connection and destroy
	 */
	this.destroy = function () {
		this.Socket.close();
		this.Socket.destroy();
		this.Socket = null;
	};

	// Einstellungen übernehmen
    if (settings) {
    	if (settings.pass) settings.password = settings.pass;
    	for(var i in settings) this[i] = settings[i];
	}
}
util.inherits(FTP, EventEmitter);

module.exports = FTP;