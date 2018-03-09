var client = new FTP({host: 'localhost', port: 21, user: 'anonymous', password: 'anonymous@'});
client.connect(function (err) {
	console.info('connected');
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