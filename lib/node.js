'use strict';

require('./utils/logger.js');

var os = require('os');
var async = require('async');
var _ = require('lodash');
var debounce = require('debounce');
var pjson = require('./../package.json');
var chalk = require('chalk');

var Primus = require('primus'),
	Emitter = require('primus-emit'),
	Latency = require('primus-spark-latency'),
	Socket, socket;

var INSTANCE_NAME = process.env.INSTANCE_NAME;
var WS_SECRET = process.env.WS_SECRET || "secret_key";

var MAX_BLOCKS_HISTORY = 40;
var UPDATE_INTERVAL = 1500;
var PING_INTERVAL = 2000;
var MAX_CONNECTION_ATTEMPTS = 50000;
var CONNECTION_ATTEMPTS_TIMEOUT = 50000;
var isConnected = false;

Socket = Primus.createSocket({
	transformer: 'websockets',
	pathname: '/api',
	timeout: 120000,
	strategy: 'disconnect,online,timeout',
	reconnect: {
		retries: 50000
	},
	plugin: {emitter: Emitter, sparkLatency: Latency}
});

if(process.env.NODE_ENV === 'production' && INSTANCE_NAME === "") {
	console.error("No instance name specified!");
	process.exit(1);
}

console.info('   ');
console.info('   ', 'NET STATS CLIENT');
console.success('   ', 'v' + pjson.version);
console.info('   ');
console.info('   ');


function Node () {
	this.info = {
		name: INSTANCE_NAME || (process.env.EC2_INSTANCE_ID || os.hostname()),
		contact: (process.env.CONTACT_DETAILS || ""),
		coinbase: null,
		node: null,
		net: "mainnet",
		protocol: "0.6.0",
		api: "0.6.0",
		port: (process.env.LISTENING_PORT || 30303),
		os: os.platform(),
		os_v: os.release(),
		client: pjson.version,
		canUpdateHistory: false,
		arkstatsVersion: "1.0.0"
	};

	this.id = _.camelCase(this.info.name);

	this.stats = {
		active: false,
		forging: false,
		peers: 0,
		pending: 0,
		delegateCount: 0,
		block: {
			number: 0,
			hash: '?',
			difficulty: 0,
			totalDifficulty: 0,
			transactions: 0,
			uncles: [],
			forger: {
				name: '',
				address: '',
				rate: '',
				productivity: 0,
				approval: 0
			}
		},
		syncing: false,
		uptime: 0
	};

	this._lastBlock = 0;
	this._lastStats = JSON.stringify(this.stats);
	this._lastFetch = 0;
	this._lastPending = 0;

	this._tries = 0;
	this._down = 0;
	this._lastSent = 0;
	this._latency = 0;

	this._socket = false;

	this._latestQueue = null;
	this.pendingFilter = false;
	this.chainFilter = false;
	this.updateInterval = false;
	this.pingInterval = false;
	this.connectionInterval = false;

	this._lastBlockSentAt = 0;
	this._lastChainLog = 0;
	this._lastPendingLog = 0;
	this._chainDebouncer = 0;
	this._chan_min_time = 50;
	this._max_chain_debouncer = 20;
	this._chain_debouncer_cnt = 0;
	this._connection_attempts = 0;
	this._timeOffset = null;

	this.startConnection();
	return this;
}


Node.prototype.askArk = function(method, endpoint, action, misc, self) {
	var http = require('http');
	var options = {
		host: process.env.RPC_HOST,
		path: endpoint,
		port: process.env.RPC_PORT,
		method: method
	};
	var req = http.request(options, function(res) {
		res.setEncoding('utf8');
		var data = '';
		res.on('data', function (chunk) {
			data += chunk;
		});

  		res.on('end', function () {
       		var jsonObject = JSON.parse(data);
       		
       		if (action == 'check') {
       			var state = jsonObject["success"];
       			isConnected = state;
       		} else if (action == 'lastblock') {
      			var block = jsonObject["blocks"][0];
      			self.askArk('GET','/api/delegates/get?publicKey=' + block.generatorPublicKey,'forger', '', self);
			self.validateLatestBlock(null, block, misc, self);
       		} else if (action == 'version') {
       			self.info.coinbase = "Ark " + jsonObject["version"];
			self.info.node = "Ark " + jsonObject["version"];
			self.info.net = process.env.NETWORK_MODE;
			self.info.protocol = jsonObject["version"];
			self.info.api = jsonObject["version"];
			console.timeEnd('Got info');
			console.info(self.info);
			self.setUptime();
			self.sendStatsUpdate(true);
		} else if (action == 'pendingtx'){
			var tx_list = jsonObject["transactions"];
			var pending = tx_list.length;
			var results = {};
			results.end = _.now();
			results.diff = results.end - misc;
			console.info('==>', 'Got', chalk.reset.red(pending) , chalk.reset.bold.green('pending tx'+ (pending === 1 ? '' : 's') + ' in'), chalk.reset.cyan(results.diff, 'ms'));
			self.stats.pending = pending;
			console.info("Last pending / current pending " + self._lastPending + "/" + pending);
			if(self._lastPending !== pending){
				console.info("Sending pending tx info");
				self.sendPendingUpdate();
				self._lastPending = pending;
			}
		} else if (action == 'syncing'){
			var syncing = jsonObject["syncing"];
			var syncing_blocks = jsonObject["blocks"];
			var current_block = jsonObject["height"];
			if (syncing == true) {
				console.info("SYNC STARTED:", syncing_blocks);
				self.stats.syncing = syncing_blocks;
				if(self._lastBlock !== current_block) {
					self._latestQueue.push(current_block);
				}
				console.info("SYNC UPDATE:", syncing_blocks);
			} else {
				console.info("SYNC:", syncing);
				self.stats.syncing = false;
				self.setFilters();
			}
		} else if (action == 'peers'){
			if(jsonObject["success"]) {
				self.stats.active = true;
				self.stats.peers = jsonObject["peers"].length;
			}

			console.info("Peer Count:", self.stats.peers);
		} else if (action == 'forging') {
			for (var i = 0; i < jsonObject.delegates.length; i++) {
				if (jsonObject.delegates[i].username == INSTANCE_NAME) {
					self.stats.forging = true;
					console.info("This instance is a forging delegate");
					break;
				}
			}
       		} else if (action == 'delegates'){
				var delegateCount = jsonObject["count"];
				self.stats.delegateCount = delegateCount;
				console.info("Delegate Count:", delegateCount);
       		} else if (action == 'forger') {
			if(jsonObject["success"]) {
				self.stats.block.forger.username = jsonObject.delegate.username;
				self.stats.block.forger.address = jsonObject.delegate.address;
				self.stats.block.forger.rate = jsonObject.delegate.rate;
				self.stats.block.forger.approval = jsonObject.delegate.approval;
				self.stats.block.forger.productivity = jsonObject.delegate.productivity;	
			}
		} else {
       			console.error('Unknown action');
       		}
  		});
	});
	req.on('error', function(e) {
		console.error('Path:', options.path);
  		console.error('Request error: ', e);
	});
	req.end();
}


Node.prototype.startConnection = function() {
	console.info('Starting connection to Ark Node');
	this.checkConnection();
}


Node.prototype.checkConnection = function() {
	var self = this;
	self.askArk('GET','/api/loader/status/sync','check', '', self);
	if(isConnected) {
		console.success('Connection established');
		this.init();
		this.getVersion();
		return true;
	} else {
		if(this._connection_attempts < MAX_CONNECTION_ATTEMPTS) {
			console.error('Connection attempt', chalk.cyan('#' + this._connection_attempts++), 'failed');
			console.error('Trying again in', chalk.cyan(500 * this._connection_attempts + ' ms'));

			setTimeout(function () {
				self.checkConnection();
			}, CONNECTION_ATTEMPTS_TIMEOUT * this._connection_attempts);
		} else {
			console.error('Connection failed', chalk.cyan(MAX_CONNECTION_ATTEMPTS), 'times. Aborting...');
		}
	}
}


Node.prototype.reconnect = function() {
	console.warn("Uninstalling filters and update interval");
	this._connection_attempts = 0;

	if(this.updateInterval)
		clearInterval(this.updateInterval);

	console.info("Reconnect attempts started");

	this.checkConnection();
}


Node.prototype.startSocketConnection = function() {
	if( !this._socket ){
		console.info('wsc', 'Starting socket connection');
		socket = new Socket(process.env.WS_SERVER);
		this.setupSockets();
	}
}


Node.prototype.setupSockets = function() {
	var self = this;
	socket.on('open', function open() {
		console.info('wsc', 'The socket connection has been opened.');
		console.info('   ', 'Trying to login');

		socket.emit('hello', {
			id: self.id,
			info: self.info,
			secret: WS_SECRET
		});
	})
	.on('ready', function() {
		self._socket = true;
		console.success('wsc', 'The socket connection has been established.');

		self.getLatestBlock();
		self.getPending();
		self.getStats(true);
	})
	.on('data', function incoming(data) {
		console.stats('Socket received some data', data);
	})
	.on('history', function (data)
	{
		console.stats('his', 'Got history request');

		self.getHistory( data );
	})
	.on('node-pong', function(data) {
		var now = _.now();
		var latency = Math.ceil( (now - data.clientTime) / 2 );

		socket.emit('latency', {
			id: self.id,
			latency: latency
		});
	})
	.on('end', function end() {
		self._socket = false;
		console.error('wsc', 'Socket connection end received');
	})
	.on('error', function error(err) {
		console.error('wsc', 'Socket error:', err);
	})
	.on('timeout', function () {
		self._socket = false;
		console.error('wsc', 'Socket connection timeout');
	})
	.on('close', function () {
		self._socket = false;
		console.error('wsc', 'Socket connection has been closed');
	})
	.on('offline', function () {
		self._socket = false;
		console.error('wsc', 'Network connection is offline');
	})
	.on('online', function () {
		self._socket = true;
		console.info('wsc', 'Network connection is online');
	})
	.on('reconnect', function () {
		console.info('wsc', 'Socket reconnect attempt started');
	})
	.on('reconnect scheduled', function (opts) {
		self._socket = false;
		console.warn('wsc', 'Reconnecting in', opts.scheduled, 'ms');
		console.warn('wsc', 'This is attempt', opts.attempt, 'out of', opts.retries);
	})
	.on('reconnected', function (opts) {
		self._socket = true;
		console.success('wsc', 'Socket reconnected successfully after', opts.duration, 'ms');

		self.getLatestBlock();
		self.getPending();
		self.getStats(true);
	})
	.on('reconnect timeout', function (err, opts) {
		self._socket = false;
		console.error('wsc', 'Socket reconnect atempt took too long:', err.message);
	})
	.on('reconnect failed', function (err, opts) {
		self._socket = false;
		console.error('wsc', 'Socket reconnect failed:', err.message);
	});
}


Node.prototype.emit = function(message, payload) {
	if(this._socket) {
		try {
			socket.emit(message, payload);
			console.sstats('wsc', 'Socket emited message:', chalk.reset.cyan(message));
			//console.success('wsc', payload);
		}
		catch (err) {
			console.error('wsc', 'Socket emit error:', err);
		}
	}
}


Node.prototype.getVersion = function() {
	var self = this;
	console.info('==>', 'Getting info');
	console.time('Got info');
	self.askArk('GET','/api/peers/version','version', '', self);
	return true;
}


Node.prototype.setInactive = function() {
	this.stats.active = false;
	this.stats.peers = 0;
	this.stats.forging = false;
	this._down++;
	this.setUptime();
	this.sendStatsUpdate(true);
	this.reconnect();
	return this;
}


Node.prototype.setUptime = function() {
	this.stats.uptime = ((this._tries - this._down) / this._tries) * 100;
}


Node.prototype.getLatestBlock = function () {
	var self = this;
	var timeString = 'Got block in' + chalk.reset.red('');
	console.time('==>', timeString);
	self.askArk('GET','/api/blocks?limit=1','lastblock', timeString, self);
}


Node.prototype.validateLatestBlock = function (error, result, timeString, self) {
	console.info("Validate");
	console.timeEnd('==>', timeString);

	var block = {
				number: 0,
				hash: '',
				difficulty: 0,
				totalDifficulty: 0,
				transactions: [],
				uncles: [],
				forger: {}
				};

	block.number = result['height'];
	block.hash = result['id'];
	block.difficulty = result['id'];
	block.totalDifficulty = result['id'];
	block.forger = this.stats.block.forger;

	var tx_count = result['numberOfTransactions']
	for (var i = 0; i < tx_count; i++) {
    	block.transactions.push(Math.random().toString(36).substring(7));
	}
	block.uncles = result['reward'];

	console.info("Block Data: ",block);

	if(block.number == 0) {
		console.error("xx>", "Got bad block:", chalk.reset.cyan(result));
		return false;
	}

	console.info('Block:',this.stats.block.number + "/" + block.number);
	console.info('Transactions included in Block:',tx_count);

	if(this.stats.block.number === block.number) {
		console.warn("==>", "Got same block:", chalk.reset.cyan(block.number));
		return false;
	} else {
		console.info(this.stats.block);
		console.info(block);
		console.warn("Blocks are different... updating block");
	}
	console.info("==>", "Got block:", chalk.reset.red(block.number));
	this.stats.block = block;
	this.sendBlockUpdate();

	if(this.stats.block.number - this._lastBlock > 1) {
		var range = _.range( Math.max(this.stats.block.number - MAX_BLOCKS_HISTORY, this._lastBlock + 1), Math.max(this.stats.block.number, 0), 1 );

		if( this._latestQueue.idle() )
			this.getHistory({ list: range });
	}
	if(this.stats.block.number > this._lastBlock) {
		this._lastBlock = this.stats.block.number;
	}
}


Node.prototype.getStats = function(forced) {
	var self = this;
	self._tries++;
	var now = _.now();
	var lastFetchAgo = now - this._lastFetch;
	this._lastFetch = now;

	if (this._socket)
		this._lastStats = JSON.stringify(this.stats);

	if (lastFetchAgo >= UPDATE_INTERVAL || forced === true) {
		console.stats('==>', 'Getting stats')
		console.stats('   ', 'last update:', chalk.reset.cyan(lastFetchAgo));
		console.stats('   ', 'forced:', chalk.reset.cyan(forced === true));

		self.getPending();
		self.askArk('GET','/api/delegates/count','delegates', '', self);
		self.askArk('GET','/api/delegates','forging', '', self);
		self.askArk('GET','/api/peers','peers', '', self);
		self.getLatestBlock();
		self.getVersion();

	}
}


Node.prototype.getPending = function() {
	var self = this;
	var now = _.now();
	console.stats('==>', 'Getting Pending')
	self.askArk('GET','/api/transactions/unconfirmed','pendingtx', now, self);
	return false;	
}


Node.prototype.getHistory = function (range) {
	var self = this;
	self.getLatestBlock();
}


Node.prototype.changed = function (){
	var changed = ! _.isEqual( this._lastStats, JSON.stringify(this.stats) );
	return changed;
}


Node.prototype.prepareBlock = function (){
	return {
		id: this.id,
		block: this.stats.block
	};
}


Node.prototype.preparePending = function () {
	return {
		id: this.id,
		stats: {
			pending: this.stats.pending
		}
	};
}


Node.prototype.prepareStats = function (){
	return {
		id: this.id,
		stats: {
			active: this.stats.active,
			syncing: this.stats.syncing,
			forging: this.stats.forging,
			peers: this.stats.peers,
			delegateCount: this.stats.delegateCount,
			uptime: this.stats.uptime
		}
	};
}


Node.prototype.sendBlockUpdate = function() {
	this._lastBlockSentAt = _.now();
	console.info("wsc", "Sending", chalk.reset.red("block"), chalk.bold.white("update"));
	this.emit('block', this.prepareBlock());
}


Node.prototype.sendPendingUpdate = function(){
	console.stats("wsc", "Sending pending update");
	this.emit('pending', this.preparePending());
}


Node.prototype.sendStatsUpdate = function (force){
	if( this.changed() || force ) {
		console.stats("wsc", "Sending", chalk.reset.blue((force ? "forced" : "changed")), chalk.bold.white("update"));
		var stats = this.prepareStats();
		console.info(stats);
		this.emit('stats', stats);
	}
}


Node.prototype.ping = function() {
	this._latency = _.now();
	socket.emit('node-ping', {
		id: this.id,
		clientTime: _.now()
	});
};


Node.prototype.setWatches = function() {
	var self = this;

	this.setFilters();

	this.updateInterval = setInterval( function(){
		self.getStats();
	}, UPDATE_INTERVAL);

	if( !this.pingInterval )
	{
		this.pingInterval = setInterval( function(){
			self.ping();
		}, PING_INTERVAL);
	}
	self.askArk('GET','/api/loader/status/sync','syncing', '', self);
}


Node.prototype.setFilters = function() {
	var self = this;
	this._latestQueue = async.queue(function (hash, callback) {
		var timeString = 'Got block ' + chalk.reset.red(hash) + chalk.reset.bold.white(' in') + chalk.reset.green('');
		console.time('==>', timeString);
		self.askArk('GET','/api/blocks?limit=1','lastblock', timeString, self);
	}, 1);

	this._latestQueue.drain = function() {
		console.sstats("Finished processing", 'latest', 'queue');
		self.getPending();
	}
	this._debouncedChain = debounce(function(hash) {
		console.stats('>>>', 'Debounced');
		self._latestQueue.push(hash);
	}, 120);
	this._debouncedPending = debounce(function() {
		self.getPending();
	}, 5);

	try {
		var now = _.now();
		var time = now - self._lastChainLog;
		self._lastChainLog = now;
		var hash = '';
		if(hash === null) {
			hash = self.stats.block.number;
		}
		console.stats('>>>', 'Chain Filter triggered: ', chalk.reset.red(hash), '- last trigger:', chalk.reset.cyan(time));
		if(time < self._chan_min_time) {
			self._chainDebouncer++;
			self._chain_debouncer_cnt++;
			if(self._chain_debouncer_cnt > 100) {
				self._chan_min_time = Math.max(self._chan_min_time + 1, 200);
				self._max_chain_debouncer = Math.max(self._max_chain_debouncer - 1, 5);
			}
		} else {
			if(time > 5000) {
				self._chan_min_time = 50;
				self._max_chain_debouncer = 20;
				self._chain_debouncer_cnt = 0;
			}
			self._chainDebouncer = 0;
		}
		if(self._chainDebouncer < self._max_chain_debouncer || now - self._lastBlockSentAt > 5000) {
			if(now - self._lastBlockSentAt > 5000) {
				self._lastBlockSentAt = now;
			}
			self._latestQueue.push(hash);
		} else {
			self._debouncedChain(hash);
		}
		console.success("Installed chain filter");
	}
	catch (err) {
		this.chainFilter = false;
		console.error("Couldn't set up chain filter");
		console.error(err);
	}
	try {
		var now = _.now();
		var time = now - self._lastPendingLog;
		self._lastPendingLog = now;
		console.stats('>>>', 'Pending Filter triggered:', chalk.reset.red(hash), '- last trigger:', chalk.reset.cyan(time));
		if(time > 50) {
			self.getPending();
		} else {
			self._debouncedPending();
		}
		console.success("Installed pending filter");
	}
	catch (err) {
		this.pendingFilter = false;
		console.error("Couldn't set up pending filter");
		console.error(err);
	}
}


Node.prototype.init = function() {
	this.getVersion();
	this.startSocketConnection();
	this.setWatches();
}


Node.prototype.stop = function(){
	if(this._socket)
		socket.end();

	if(this.updateInterval)
		clearInterval(this.updateInterval);

	if(this.pingInterval)
		clearInterval(this.pingInterval);
}


module.exports = Node;
