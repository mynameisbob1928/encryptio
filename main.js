const args = process.argv.slice(2);
if (!args[0]) {
	console.log(`
Encryptio syntax message

[] is required, <> is optional
node main [method] [path] [key] <output path>

method is the type of encryption/decryption you would like to do.
The possible options are:
  e  - Encrypt a single file.
  ef - Encrypt a folder (and sub-folders).
  d  - Decrypt a single file.
  df - Decrypt a folder of encrypted files.
  list - List the encrypted files that are incldued within a directory (will ignore output path and does not check subdirectories)

path is the path to file/folder that you want to encrypt/decrypt

key is the key for encrypting/decrypting your files

output path is the path that you would like the encrypted/decrypted file(s) to go to.
If this is ommited then encrypted files will go to the current directory and decrypted files will go back to the exact location it was before it was encrypted, creating new folders if required.
Do note that when decrypting with a folder of encrypted files and you are using an output path, the files will keep their relative folder structure inside the folder you have chosen.

Example command:
  node main ef C:/Users/Bob/Documents/SecretFolder VerySecretPassword C:/Users/Bob/Documents/EncryptedFolder
`);
	process.exit();
}
if (!['e', 'ef', 'd', 'df', 'list'].includes(args[0]) || !args[1] || !args[2]) {
	console.log('Invalid args\nRun this command with no arguments to view the command syntax');
	process.exit();
}

const fs = require('fs');
const { AES, enc } = require('crypto-js');
const { resolve, relative, dirname, join, isAbsolute, basename } = require('path');
let encPath = 'null';

function encrypt(filepath, out = __dirname, key) {
	if (!fs.existsSync(filepath)) return console.log(`The file at ${filepath} does not exist`);
	out !== __dirname && !fs.existsSync(out) ? fs.mkdirSync(out, { recursive: true }) : null;

	const fileinstream = fs.createReadStream(filepath, { encoding: 'base64' });
	const fileoutstream = fs.createWriteStream(`${out}/${AES.encrypt((filepath.split('/').slice(-1)[0].split('.')[0]), key).toString().replace(/\//g, '##')}`, { encoding: 'utf8' });

	fileoutstream.write(AES.encrypt(`${filepath}~~|~~${encPath}~~|~~`, key).toString());
	fileinstream.on('data', chunk => fileoutstream.write(`-${AES.encrypt(chunk, key).toString()}`));

	fileinstream.on('end', () => {
		fileoutstream.close();
	});

	fileinstream.on('error', err => {
		console.error(`Error reading file ${filepath}\n${err.message}\n${err.cause}`);
		fileinstream.close();
		fileoutstream.close();
	});
}

function decrypt(filepath, out = null, key) {
	const fileinstream = fs.createReadStream(filepath, { encoding: 'utf8' });
	let fileChunks = [];

	fileinstream.on('data', chunk => {
		fileChunks.push(chunk);
	});

	fileinstream.on('end', () => {

		const unEncChunks = [];
		let hold = '';
		while (fileChunks.length !== 0) {
			const chunks = fileChunks[0].split('-');
			fileChunks.shift();
			if (chunks.length == 1) {
				hold = hold + chunks[0];
				continue;
			}
			unEncChunks.push(hold + chunks.shift());
			hold = chunks.pop();
			chunks.forEach(chunk => unEncChunks.push(chunk));
		}
		unEncChunks.push(hold);

		fileChunks = unEncChunks.map(chunk => AES.decrypt(chunk, key).toString(enc.Utf8));
		const decrypted = fileChunks[0].split('~~|~~');
		decrypted.pop();
		fileChunks[0] = fileChunks[0].replace(`${decrypted.join('~~|~~')}~~|~~`, '');
		const origialPath = decrypted[0].replace(/\\\\/g, '/').replace(/\\/g, '/');
		let outputPath = origialPath;

		if (decrypted[1] !== 'null' && out) {
			const left = origialPath.replace(decrypted[1], '');
			outputPath = relative(__dirname, (join(out, left)));
		}
		else if (out) {
			if (isAbsolute(out)) outputPath = `${out}/${basename(decrypted[0])}`;
			else outputPath = `${!relative(__dirname, out) ? '.' : relative(__dirname, out)}\\${basename(decrypted[0])}`;
		}
		const outputDir = dirname(outputPath);
		if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

		const fileoutstream = fs.createWriteStream(outputPath, { encoding: 'base64' });

		for (const chunk of fileChunks) {
			fileoutstream.write(chunk);
		}
	});


}

async function encryptfolder(dir, outputdir, key) {
	let results = [];
	encPath = dirname(resolve(dir, fs.readdirSync(dir)[0])).replace(/\\\\/g, '/').replace(/\\/g, '/');
	async function walk(currentDir) {
		const list = await fs.promises.readdir(currentDir);

		await Promise.all(
			list.map(async (file) => {
				const filePath = resolve(currentDir, file);
				const stat = await fs.promises.stat(filePath);

				if (stat.isDirectory()) {
					await walk(filePath);
				}
				else {
					console.log(filePath);
					results.push(filePath);
				}
			}),
		);
	}
	await walk(`${dir}`);
	console.log(results);
	results.forEach(file => {
		console.log(file);
		encrypt(file, outputdir, key);
	});

}

async function decryptfolder(dir, outputdir, key) {
	const files = fs.readdirSync(dir);
	for (const file of files) {
		decrypt(`${dir}/${file}`, outputdir, key);
	}
}

if (args[0] == 'list') {
	let h = false;
	if (args.includes('--suppress-list-error')) h = true;
	let a = false;
	const files = fs.readdirSync(args[1]).map(filename => {
		try {
			return `${AES.decrypt(filename.replace(/##/g, '/'), args[2]).toString(enc.Utf8)} - ${filename}`;
		}
		catch (err) {
			if (err.message === 'Malformed UTF-8 data') {
				if (h) return;
				console.log(`File ${filename} is not encrypted/is encrypted with a different key but is in the same directory`);
				a = true;
				return null;
			}
			else {
				console.error(err);
				return null;
			}
		}
	}).filter(a => a).join('\n');

	if (a) console.log('Hint: Add --suppress-list-error onto the end of the command to not send the "is not encrypted" error message');
	console.log(files);
}
else if (args[0] == 'e') {
	encrypt(args[1], args[3], args[2]);
}
else if (args[0] == 'd') {
	decrypt(args[1], args[3], args[2]);
}
else if (args[0] == 'ef') {
	encryptfolder(args[1], args[3], args[2]);
}
else if (args[0] == 'df') {
	decryptfolder(args[1], args[3], args[2]);
}

process.on('uncaughtException', (error) => {
	if (error.message == 'Malformed UTF-8 data') {
		console.log('The key provided was invalid');
		process.exit();
	}
	else {
		console.log(error);
	}
});
