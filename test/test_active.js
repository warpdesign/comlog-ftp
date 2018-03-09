var net = require('net');
Socket = net.Socket;

var cmdSocket = new Socket();
cmdSocket.setEncoding('binary');

var server = undefined;
var dataSocket = undefined;
var port = 21;
var host = "localhost";
var user = "ar";
var password = "wert2345";
var active = false;

function onConnect(){
}

var str="";
function onData(chunk) {
	console.log(chunk.toString('binary'));
	var code = chunk.substring(0,3);
	//if ftp server return code = 220
	if(code == '220'){
		_send('USER ' + user, function(){
		});
	}else if(code == '331'){
		_send('PASS ' + password, function(){
		});
	}
	else if(code == '230'){
		if(active){
			server = net.createServer(function(socket){
				dataSocket = socket;
				console.log('new connection');
				socket.setKeepAlive(true, 5000);

				socket.on('connect', function(){
					console.log('socket connect');
				});

				socket.on('data', function(d){
					console.log('socket data: ' + d);
				});

				socket.on('error', function(err){
					console.log('socket error: ' + err);
				});

				socket.on('end', function() {
					console.log('socket end');
				});

				socket.on('drain', function(){
					console.log('socket drain');
				});

				socket.on('timeout', function(){
					console.log('socket timeout');
				});

				socket.on('close', function(){
					console.log('socket close');
				});
			});

			server.on('error', function(e){
				console.log(e);
			});

			server.on('close', function(){
				console.log('server close');
			});

			server.listen(function(){
				console.log('listening');

				var address = server.address();
				var port = address.port;
				var p1 = Math.floor(port/256);
				var p2 = port % 256;

				_send('PORT 127,0,0,1,' + p1 + ',' + p2, function(){

				});
			});
		}else{
			_send('PASV', function(){

			});
		}
	}
	else if(code == '200'){
		_send('STOR file.txt', function(){

		});
	}
	//ready for data
	else if (code == '150') {
		dataSocket.write('some wonderful file contents\r\n', function(){});
		dataSocket.end(null, function(){});
	}

	//transfer finished
	else if ( code == '226') {
		_send('QUIT', function(){ console.log("Saying Goodbye");});
	}

	//session end
	else if ( code == '221') {
		cmdSocket.end(null, function(){});
		if(!!server){ server.close(); }
	}
}

function onEnd() {
	console.log('half closed');
}

function onClose(){
	console.log('closed');
}

cmdSocket.once('connect', onConnect);
cmdSocket.on('data', onData);
cmdSocket.on('end', onEnd);
cmdSocket.on('close', onClose);

cmdSocket.connect(port, host);

function _send(cmd, callback){
	cmdSocket.write(cmd + '\r\n', 'binary', callback);
}