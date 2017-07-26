'use strict';

var nodeModel = require('./lib/node');
var node = new nodeModel();
var gracefulShutdown = function() {
	console.log('');
    console.error("RISE", "sys", "Received kill signal, shutting down gracefully.");

    node.stop();
    console.info("RISE", "sys", "Closed node watcher");

    setTimeout(function(){
        console.info("xxx", "sys", "Closed out remaining connections.");
        process.exit(0);
    }, 1000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('message', function(msg) {
	if (msg == 'shutdown') {
		gracefulShutdown();
	}
});

module.exports = node;
