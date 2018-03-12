var FTP = require('../');
var client = new FTP({host: 'localhost', active: false, debug: true});
client.connect(function (err) {
	var get_file = function () {
		setTimeout(function () {
			client.get('5541-Saarbrücken-1-20180305-173631.bor', 'C:\\daten\\5541-Saarbrücken-1-20180305-173631.bor', function (err) {
				console.info(err, 'done');
				put_file();
			});
		}, 500);
	};

	var put_file = function () {
		setTimeout(function () {
			client.put('C:\\daten\\5541-Saarbrücken-1-20180305-173631.bor', '5541-Saarbrücken-1-20180305-173631.bor', function (err) {
				console.info(err, 'done');
				console.info(process.memoryUsage().heapUsed / 1024 / 1024);
				get_file();
			});
		}, 500);
	};

	put_file();
});

//client.on('ready', function () {
//	console.info('Ready');
/*	client.feat(function (data) {
		console.info(data);
	});*/
/*client.put('C:\\daten\\down.txt', '/down.txt', function (err) {
	console.info(err);
});*/
/*client.cwd('/', function (err) {
	console.info(err);
});*/
/*client.rename('test1.txt', 'test.txt', function (err) {
	console.info(err);
});*/
/*client.delete('down.txt', function (err) {
	console.info(err);
});*/
/*client.mkdir('test1', function (err) {
	if (err) return console.info(err);
	client.rmdir('test1', function (err) {
		console.info(err);
	})
});*/

//	client.stat(function (err) {
//		console.info(err);
//	});

//});