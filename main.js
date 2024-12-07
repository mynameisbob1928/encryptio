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
	out !== __dirname && !fs.existsSync(out) ? fs.mkdirSync(out, { recursive: true }) : null;
	const file = `${filepath}~~|~~${encPath}~~|~~${fs.readFileSync(filepath, 'base64').slice(0, -2)}`;
	fs.writeFileSync(`${out}/${AES.encrypt((filepath.split('/').slice(-1)[0].split('.')[0]), key).toString().replace(/\//g, '##')}`, AES.encrypt(file, key).toString(), 'utf8');
}

function decrypt(filepath, out = null, key) {
	const file = fs.readFileSync(`${filepath}`, 'utf8');
	const decrypted = AES.decrypt(file, key).toString(enc.Utf8).split('~~|~~');
	const origialPath = decrypted[0].replace(/\\\\/g, '/').replace(/\\/g, '/');
	let outputPath = origialPath;

	if (decrypted[1] !== 'null' && out) {
		const left = origialPath.replace(decrypted[1], '');
		outputPath = relative(__dirname, (join(out, left)));
	}
	else if (out) {
		if (isAbsolute(out)) outputPath = `${out}/${basename(decrypted[0])}`;
		else outputPath = `${relative(__dirname, out)}\\${basename(decrypted[0])}`;
		console.log(outputPath);
	}

	const outputDir = dirname(outputPath);
	if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

	fs.writeFileSync(outputPath, decrypted[2], 'base64');
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
					results.push(filePath);
				}
			}),
		);
	}
	await walk(`${dir}`);
	results.forEach(file => {
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
			return AES.decrypt(filename.replace(/##/g, '/'), args[2]).toString(enc.Utf8);
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
});
