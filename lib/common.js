/* Общие функции */

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var rimraf = require('rimraf');

var self = this;


this.lock = function(lock_file_txt, argv, cb) {
	if (argv.force) {
		try {
			fs.unlinkSync(lock_file_txt);
		} catch (err) {}
	}
	fs.exists(lock_file_txt, function(exists) {
		if (!exists) {
			fs.writeFile(lock_file_txt, '', function(err) {
				if (!err) {
					fs.chmod(lock_file_txt, '0600', function(err) {
						if (!err) {
							cb(null, lock_file_txt);
						} else { cb(err); }
					});
				} else { cb(err); }
			});
		} else { cb('Есть lockfile - ' + path.basename(lock_file_txt)); }
	});
};

this.unlock = function(lock_file_txt, lastsync_file_txt, argv, callback) {
	if (argv['dry-run']) {
		fs.unlink(lock_file_txt, function(err) { callback(err); });
	} else {
		fs.writeFile(lastsync_file_txt, '', function(err) {
			if (!err) {
				fs.unlink(lock_file_txt, function(err) { callback(err); });
			} else { callback(err); }
		});
	}
};

this.exec = function(cmd, argv, cb, logfile, v_stdout, v_stderr, this2) {
	var this3 = this2;
	if (logfile) {
		var stream = fs.createWriteStream(logfile, { flags:'w', encoding:'utf8' });
	}
	if (typeof(v_stdout) == 'undefined') { v_stdout = true; }
	if (typeof(v_stderr) == 'undefined') { v_stderr = true; }
	var stdout = '';
	var stderr = '';
	cmd = spawn(cmd, argv);
	cmd.stdout.on('data', function (data) {
		stdout = stdout + data;
		data = data.toString().trim()+'\n';
		if (logfile) { stream.write(data); }
		if (v_stdout) { process.stdout.write(data); }
		if (this3) { this3.emit('output', data) };
		if (this2 && logfile) { this2.emit('write_logfile', logfile); this2 = false }
	});
	cmd.stderr.on('data', function (data) {
		stderr = stderr + data;
		data = data.toString().trim()+'\n';
		if (logfile) { stream.write(data); }
		if (v_stderr) { process.stdout.write(data); }
		if (this3) { this3.emit('output', data) };
		if (this2 && logfile) { this2.emit('write_logfile', logfile); this2 = false }
	});
	cmd.on('close', function (code) {
		if (logfile) {
			stream.end();
			stream.destroy();
		}
		cb(code, stdout, stderr);
	});
};

this.createArchive = function(archive_dir, archive_file, cb) {
	var now_dir = process.cwd();
	try {
		process.chdir(archive_dir);
		self.exec('tar', ['-czvf', archive_file, '.'], function(err, stdout, stderr) {
			process.chdir(now_dir);
			if (!err) {
				console.log('rm -rf', archive_dir);
				rimraf(archive_dir, function(err) {
					cb(err);
				});
			} else { cb(err); }
		});
	} catch(e) { cb(e); }
};
