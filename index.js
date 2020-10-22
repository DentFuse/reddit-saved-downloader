const snoowrap = require('snoowrap');
const cliProgress = require('cli-progress');
const got = require('got');
const signale = require('signale');
const { prompt, Password, select } = require('enquirer');
const fs = require('fs');

const logins = require('./config');
const dataFile = 'data.json';
const supported =  ['jpg', 'png'] //['i.redd.it', 'i.imgur.com'];

function simplePrompt(name) {
	return {
		type: 'input',
		name: name,
		message: 'What is your ' + name + '?'
	}
}

function getAccountOptions() {
	const accs = [];
	if(fs.existsSync('./' + dataFile)) {
		const accFile = JSON.parse(fs.readFileSync('./' + dataFile, 'utf-8'));
		for(const e of Object.keys(accFile)) accs.push(e);
	}
	accs.push('Add New Account');
	return accs;
}

async function main() {
	let addAccount = false, loginData, currentLogin;
	if(!fs.existsSync('./' + dataFile)) {
		addAccount = true;
		signale.start('Welcome, please add account for first use...');
		loginData = {};
	} else {
		loginData = JSON.parse(fs.readFileSync('./' + dataFile, 'utf-8'));
	}
	const account = await select({ name: 'account', message: 'Please select an account or add a new account.', choices: getAccountOptions()});
	if(account !== 'Add New Account') {
		currentLogin = loginData[account]
	}
	addAccount = addAccount || account === 'Add New Account';
	if(addAccount) {
		const clientId = (await prompt(simplePrompt('clientId'))).clientId;
		const clientSecret = (await prompt(simplePrompt('clientSecret'))).clientSecret;
		const username = (await prompt(simplePrompt('username'))).username;
		currentLogin = { clientId, clientSecret, username };
		loginData[username] = Object.assign({}, currentLogin);
	}
	const password = (await prompt({ type: 'password', name: 'password', message: 'Please enter your password, this will not be saved and you will be required to enter it everytime you start the script.'})).password;
	currentLogin.password = password;
	currentLogin.userAgent = 'Personal Saved Post Image Downloader';
	signale.info('Attempting login...');
	try {
		const snoo = new snoowrap(currentLogin);
		await snoo.getMe();
		signale.success('Successfully logged in!');
		if(addAccount) fs.writeFileSync('./' + dataFile, JSON.stringify(loginData));
		start(snoo, currentLogin.username);
	} catch (e) {
		signale.fatal('An error occured, if you\'ve just entered your login data, please restart script and double check that everything is correct.')
		signale.error(e);
		process.exit(0);
	}
}

function reduceData(e) {
	return {
		subreddit: e.subreddit.display_name,
		author_fullname: e.author_fullname,
		title: e.title,
		name: e.name,
		ups: e.ups,
		created: e.created,
		url_overridden_by_dest: e.url_overridden_by_dest
	};
}

async function start(snoo, username) {
	let newArr;
	if(!fs.existsSync('./saves/' + username + '.json')) {
		signale.warn('Couldn\'t find account file, getting all...');
		const saved = await snoo.getMe().getSavedContent().fetchAll();
		newArr = saved.map(reduceData);
		fs.writeFileSync('./saves/' + username + '.json', JSON.stringify(newArr));
		downloadHandler(newArr, username)
	} else {
		const local = JSON.parse(fs.readFileSync('./saves/' + username + '.json', 'utf-8'));
		const last = local[0].name;
		let index = -1, arr, reducedArr;
		while(index == -1) {
			if(!arr) {
				arr = await snoo.getMe().getSavedContent({amount: 100, skipReplies: true}).fetchMore({amount: 100, skipReplies: true});
			} else {
				arr = await arr.fetchMore({amount: 100, skipReplies: true});
			}
			reducedArr = arr.map(reduceData);
			index = reducedArr.findIndex(e => e.name === last);
			console.log(reducedArr.length, index);
		}
		newArr = reducedArr.slice(0, index);
		downloadHandler(newArr, username, local)
	}
}

async function downloadHandler(arr, username, local) {
	signale.info('Items to process:', arr.length);
	if(arr.length == 0) {
		signale.complete('No new stuff to download!');
		process.exit(0);
	}
	let bar = new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic);
	let count = 0;
	signale.time('Timer')
	bar.start(arr.length, 0);
	if(!fs.existsSync('./out/' + username)) fs.mkdirSync('./out/' + username);
	bar = logWhileBar(bar, 'Starting download', count, arr.length, signale.start);
	for(const i of arr) {
		bar = logWhileBar(bar, 'Processing ' + i.title, count, arr.length, signale.start);
		if(!i.url_overridden_by_dest) {
			bar = logWhileBar(bar, 'Non-Media post, ignoring...', count, arr.length, signale.warn);
			count++;
			continue;
		}
		let validURL = supported.some(s => i.url_overridden_by_dest.includes(s));
		if(!validURL) {
			bar = logWhileBar(bar, 'Unsupported url, ignoring..., url: ' + i.url_overridden_by_dest, count, arr.length, signale.warn);
			count++;
			continue;
		}
		const filePath = ('./out/' + username  + '/' + i.subreddit + '-' + i.name.slice(3) + '.' + i.url_overridden_by_dest.split('.')[i.url_overridden_by_dest.split('.').length - 1]).split('?')[0];

		if(fs.existsSync(filePath)) {
			bar = logWhileBar(bar, 'file exists skipping...', count, arr.length, signale.info);
			count++;
			continue;
		}
		let file;
		try {
			file = await download(i.url_overridden_by_dest);
		} catch (e) {
			bar = logWhileBar(bar, 'Failed to download', count, arr.length, signale.error);
			count++;
			continue;
		}
		fs.writeFile(filePath, file, 'binary', (err) => err ? (bar = logWhileBar(bar, err, count, arr.length, signale.error)): null);
		count++;
		bar = logWhileBar(bar, 'Download complete!', count, arr.length, signale.success);
	}
	bar.stop();
	signale.timeEnd('Timer');
	signale.complete('Complete!');
	if(local) fs.writeFileSync('./saves/' + username + '.json', JSON.stringify(arr.concat(local)));
}

function logWhileBar(bar, message, count, total, type) {
	type = type ? type : signale.info;
	bar.stop();
	type(message);
	bar = new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic);
	bar.start(total, count);
	return bar;
}

function download(url) {
	return new Promise(async (resolve, reject) => {
		try {
			const res = await got(url, { responseType: 'buffer' });
			resolve(res.body);
		} catch (e) {
			reject(e);
		}
	});
}

main();
