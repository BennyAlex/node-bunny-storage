# BunnyCDN Storage API Wrapper

This is a Node.js library that provides a simple and convenient way to interact with BunnyCDN Storage.
It allows to download and upload files and complete folders, and you can download and multiple files in parallel.
There is also a built-in retry for failed request.
You can exclude certain file types from being uploaded or downloaded when dealing with folders.

## Installation

```bash
npm install --save node-bunny-storage
```

## Usage
First, import the package and initialize it with your access key and storage zone name:

```javascript
import BunnyCDNStorage from 'node-bunny-storage';

const bunny = new BunnyCDNStorage('your-access-key', 'your-storage-zone-name');

// you can also set the concurrency and the retryCount
const bunny = new BunnyCDNStorage('your-access-key', 'your-storage-zone-name', 4, 1);
```
### List Files
To list files from a remote directory:
```javascript
const files = await bunny.listFiles('/', true); // list all files from root folder recursively
```

### Download File
To download a file from a remote directory:
```javascript
const downloadedFilePath = await bunny.downloadFile('/', files[0].ObjectName, './testDownload/singleFileTestDownload'); // download the first file from the root folder
```

### Upload File
To upload a file to a remote directory:
```javascript
// upload the file to /testRemoteSingleFileUpload folder
await bunny.uploadFile('./testDownload/singleFileTestDownload/' + files[0].ObjectName, 'testRemoteSingleFileUpload');
```

### Delete File or Folder
To delete a file or folder from a remote directory:
```javascript
// delete the first file from the root folder
await bunny.delete('/', files[0].ObjectName);
```

### Upload Folder
To upload a complete local folder:
```javascript
// upload all files from the ./testDownload folder to the remote /testRemoteFolderUpload folder, except .html files
await bunny.uploadFolder('./testDownload', 'testRemoteFolderUpload', true, ['.html']);
```

### Download Folder
To download a complete remote folder:
```javascript
  // download all files from the remote folder including subdirectories to the ./testDownload/downloadFolderTest folder, except .png and .jpg files
const downloadedFilesPaths = await bunny.downloadFolder('/', './testDownload/downloadFolderTest', true, ['.png', '.jpg']);
```

## Example
For a full example, look at the test.js script.

## License
GNU General Public License v3.0
