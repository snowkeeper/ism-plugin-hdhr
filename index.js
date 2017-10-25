const hdhr = require('hdhomerun');
const request = require('request-promise');
const Blue = require('bluebird');
const devnull = require('dev-null');
const ffmpeg = require('fluent-ffmpeg');
const async = require('async');
const fs = require('fs');
const d23 = '13264E94';
const d24 = '1323C1DC';

hdhr.discover(function (err, res) {
	if (err) throw new Error('discover error');

	res.forEach(function (dev) {
		console.log('hdhomerun device %s found at %s',
			dev.device_id, dev.device_ip);
	});
	
	var device23 = hdhr.create(res[1]);
	var device24 = hdhr.create(res[0]);
	
	Blue.promisifyAll(device23, { suffix: 'P' });
	Blue.promisifyAll(device24, { suffix: 'P' });
	
	var deviceURL = "http://cablecard/lineup.json?show=unprotected";
	
	let promises = [];
	let Channels = [];
	
	request({
		method: 'get',
		uri: deviceURL, 
		json: true
	})
	.then(channels => {
		async.eachSeries(channels, ( c, cb ) => {
			//tune the channel via the hhtp address so we cna query the unit
			let info = { ...c };
			let kill;
			//console.log('channel run ffmpeg', c);
			const command = ffmpeg(c.URL).format('mpegts')
			.on('start', function(commandLine) {
				//console.log('Spawned Ffmpeg with command: ' + commandLine);
				kill = setTimeout(function(){
					command.kill();
					console.log('killed via timeout');
					cb();
				}, 10000);
			})
			.on('error', function(err) {
				console.log(err.message);
			})
			.on('end', function() {
				console.log('Processing finished !');
			});
			
			let a = 1;
			const ffstream = command.pipe();
			ffstream.on('data', function(d) {
				//console.log('ffmpeg sent data');
				a++;
				if(a===2) {
					device23.getP('/tuner2/channel')
						.then(r => {
							info.freq = r.value.substr(4);
							console.log( info.freq);
							return device23.getP('/tuner2/program');
						})
						.then(r => {
							info.program = r.value;
							console.log( info.program);
							Channels.push(info);
							//stop ffmpeg
							return r
						})
						.then(r => {
							clearTimeout(kill);
							setTimeout(()=>{
								command.kill();
								console.log(info);
								cb();
							}, 10);
						})
						.catch(e => {
							console.log('ERROR', e);
						});
				}
			});
			
		}, function (err) {
			console.log("the Channels array was created", Channels);
			var filename = 'channels.js';
			var str = JSON.stringify(Channels, null, 4);

			fs.writeFile(filename, str, function(err){
				if(err) {
					console.log(err)
				} else {
					console.log('File written!');
				}
			});
		});
		
	})
	.catch(function( e ) {
		console.log('FAIL:', e)
	});
	
});

	

