const EventEmitter = require('events');
const util = require('util');
const net = require('net');
const ListingParser = require("parse-listing");
const fs = require("fs");
const stream = require("stream");

var PASV_REG = /([-\d]+,[-\d]+,[-\d]+,[-\d]+),([-\d]+),([-\d]+)/;
var FunctionQueue = function() {
	this.queue = [];
	this.add = function (type, args) {
		var item = {args: [], type: type};
		for(var i=0; i < args.length; i++) item.args.push(args[i]);
		this.queue.push(item);
	};
	this.on = function (e) { this.add('on', arguments); };
	this.once = function (e) { this.add('once', arguments); };
	this.setEncoding = function (e) { this.add('setEncoding', arguments); };
	this.destroy = function () {};
	this.apply = function (socket) {
		while (this.queue.length > 0) {
			var item = this.queue.shift();
			socket[item.type].apply(socket, item.args);
		}
		this.prototype = socket.prototype;
		for(var i in socket) {
			this[i] = socket[i];
		}
	}
};

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
	this.debug = false;

	this.DataSocket = null;

	var _bindEvents = function () {
		var eventList = ['connect', 'end', 'close', 'error'];
		for(var i=0; i < eventList.length; i++) {
			(function (e) {
				_this.Socket.on(e, function () {
					_this.emit(e, arguments[0], arguments[1], arguments[2]);
				});
			})(eventList[i]);
		}

		_this.Socket.on('data', function (chunk) {
			var lines = (chunk+'').split("\r\n");
			while(lines.length > 0) {
				var line = lines.shift();
				if (line !== '') {
					_this.emit('data', line, arguments[1], arguments[2]);
				}
			}
		});

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

	// Login fail
	this.on('530', function (chunc) { this.emit('error', new Error(chunc)); });

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
		try {
			this.Socket.write(cmd + '\r\n', this.encoding, cb);
		} catch (e) { cb(e); }
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
	this.getDataSocket = function (cb) {
		var cb_once = function (err, sock) { if (cb) { cb(err, sock); cb = null; } };
		if (this.active) {
			var server;

			var queue = new FunctionQueue();
			server = net.createServer(function(socket){
				if (_this.debug) console.log('Incomming active connection');
				_this.DataSocket = socket;

				socket.setKeepAlive(true, 5000);

				socket.on('connect', function(){
					if (_this.debug) console.log('Active socket connected');
				});

				socket.on('data', function(d){
					if (_this.debug) console.log('Active socket data: ' + d);
				});

				socket.on('error', function(err){
					if (_this.debug) console.log('Active socket error: ' + err);
				});

				socket.on('end', function() {
					if (_this.debug) console.log('Active socket ended');
				});

				socket.on('close', function() {
					if (_this.debug) console.log('Active socket closed');
					_this.DataSocket = null;
					server.close();
					server = null;
				});

				queue.apply(_this.DataSocket);
			});

			server.on('error', function(e){
				cb_once(e, null);
			});

			server.on('close', function(){
				cb_once(new Error('Aktive server closed'), null);
			});

			server.listen(function(){
				if (_this.debug) console.log('Active server started');
				var address = server.address();
				var port = address.port;
				var p1 = Math.floor(port/256);
				var p2 = port % 256;

				_this.raw('PORT','127,0,0,1,' + p1 + ',' + p2, function(res) {
					if (res.substr(0, 3) != '200') return cb_once(new Error(res), null);
					cb_once(null, queue);
				});
			});
		}
		else {
			this.raw('PASV', function(res) {
				var match = (res+'').match(PASV_REG);
				if (match) {
					var host = match[1].split(',').join("."),
						port  = (parseInt(match[2], 10) & 255) * 256 + (parseInt(match[3], 10) & 255);

					if (host === "127.0.0.1") host = _this.host;
					_this.DataSocket = _this.createSocket(host, port);
					_this.DataSocket.setTimeout(_this.timeout);
					_this.DataSocket.once("close", function() {
						_this.DataSocket.destroy();
						delete _this.DataSocket;
					});
					_this.DataSocket.once('connect', function (data) {
						cb_once(null, _this.DataSocket);
					});
					_this.DataSocket.once('error', function (err) {
						var e = new Error("Can't open passiv connenction:"+err.message);
						_this.emit('error', e);
						cb_once(e, null);
					});
				}
				else {
					var err = new Error("Can't open passiv connenction:"+res);
					_this.emit(err);
					cb_once(err, null);
				}
			});
		}
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
		var cb_once = function (err, sock) { if (cb) { cb(err, sock); cb = null; } };
		this.getDataSocket(function (serr, psock) {
			if (psock) {
				psock.setEncoding(_this.encoding);
				var data = '';
				var isDone = false;
				var isClosed = false;
				var _parse = function (err) {
					if (isClosed && isDone) {
						ListingParser.parseFtpEntries(data, function(parseErr, files) {
							var errors = [];
							if (err) errors.push(err.message);
							if (parseErr) errors.push(parseErr.message);

							cb_once(
								errors.length > 0 ? new Error(errors.join("\r\n")) : null,
								files,
								data
							);
						});
					}
				};

				psock.on('data', function (d) {
					data += d;
				});
				psock.on('error', function (e) {
					cb_once(e);
				});

				psock.on('close', function () {
					if (_this.debug) console.info('close data socket');
					isClosed = true;
					_parse();
				});

				_this.raw('LIST '+(dir || ''), function (res) {
					if ((['125', '150']).indexOf(res.substr(0, 3)) == -1) return cb_once(new Error(res));
					_this.once('data', function (res2) {
						isDone = true;
						if (res2.substr(0, 3) != '226') return _parse(new Error(res2));
						_parse();
					});
				});
			}
			else cb_once(serr);
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
		var cb_once = function (err, sock) { if (cb) { cb(err, sock); cb = null; } };
		this.getDataSocket(function (serr, psock) {
			if (psock) {
				psock.setEncoding(_this.encoding);

				_this.raw('RETR',src, function (res) {
					if ((['150', '125']).indexOf(res.substr(0, 3)) == -1) {
						cb_once(new Error(res));
					}
					else if(!dst) {
						cb_once(null, psock);
					}
					else {
						var writeStream = fs.createWriteStream(dst, {encoding: _this.encoding});

						psock.on('error', function (err) {
							cb_once(err);
						});

						writeStream.on('error', function (err) {
							cb_once(err);
						});

						psock.on('close', function () {
							writeStream.end();
						});

						_this.once('data', function (res) {
							cb_once((res.substr(0, 3) != '226' ? new Error(res) : null), res);
						});

						psock.pipe(writeStream);
					}
				});
			}
			else cb_once(serr);
		});
	};

	/**
	 * Upload file to Server
	 * @param {String|stream.Readable} src local file
	 * @param {String} dst Online file path
	 * @param {Function} cb Callback function
	 */
	this.put = function (src, dst, cb) {
		var cb_once = function (err, sock) { if (cb) { cb(err, sock); cb = null; } };
		var readStream;
		if (src instanceof stream.Readable) readStream = src;
		else readStream = fs.createReadStream(src, {encoding: _this.encoding});

		readStream.on('error', function (e) {
			cb_once(e);
			readStream.destroy();
		});
		readStream.on('readable', function () {
			_this.getDataSocket(function (serr, psock) {
				if (psock) {
					psock.setEncoding(_this.encoding);

					psock.on('error', function (err) {
						readStream.close();
						cb_once(err);
					});

					psock.on('close', function () {
						_this.once('data', function (res) {
							cb_once((res.substr(0, 3) != '226' ? new Error(res) : null), res);
						})
					});

					_this.raw('STOR',dst, function (res) {
						if ((['125', '150']).indexOf(res.substr(0, 3)) == -1) {
							readStream.close();
							psock.destroy();
							cb_once(new Error(res));
						}
						else {
							readStream.pipe(psock);
						}
					});
				}
				else cb_once(serr);
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
	this.end = this.destroy = function () {
		if (this.Socket) {
			this.Socket.end();
			this.Socket.destroy();
			this.Socket = null;
		}
	};

	// Einstellungen übernehmen
    if (settings) {
    	if (settings.pass) settings.password = settings.pass;
    	for(var i in settings) this[i] = settings[i];
	}
}
util.inherits(FTP, EventEmitter);

module.exports = FTP;