# BunnyCDN Storage API Wrapper

This is a Node.js library that provides a simple and convenient way to interact with BunnyCDN Storage.

It allows to download and upload files and complete folders, and you can download and multiple files in parallel.
There is also a built-in retry for failed request.
You can exclude certain file types from being uploaded or downloaded when dealing with folders.
The log level is also configurable.

## Installation

```bash
npm install --save node-bunny-storage
```

## Usage
First, import the package and initialize it with your access key and storage zone name:

```javascript
import BunnyCDNStorage from 'node-bunny-storage';

const bunny = new BunnyCDNStorage({accessKey: 'your-access-key', storageZoneName: 'your-storage-zone-name'});

// you can also set the concurrency, the retryCount and the log level
const bunny = new BunnyCDNStorage({
  accessKey: 'your-access-key',
  storageZoneName: 'your-storage-zone-name',
  concurrency: 10,
  retryCount: 1,
  logLevel: 'silent'
});
```
### List Files
To list files from a remote directory:
```javascript
// list all files from root folder recursively
await bunny.listFiles({remoteDirectory: '/', recursive: true});
```

### Download File
To download a file from a remote directory:
```javascript
// get the remote file path using the getCompleteRemotePathFromFile function
const remoteFileDirectory = bunny.getRemotePathFromFileWithoutStorageZone(files[0]);
const fileName = files[0].ObjectName;

// download the first file from the root folder
const downloadedFilePath = await bunny.downloadFile({
  remoteDirectory: remoteFileDirectory, fileName: fileName, localDirectory: './testDownload/singleFileTestDownload'
})
```

### Upload File
To upload a file to a remote directory:
```javascript
// upload the file to /testRemoteSingleFileUpload folder
await bunny.uploadFile({
  localFilePath: './testDownload/singleFileTestDownload/' + fileName,
  remoteDirectory: 'testRemoteSingleFileUpload'
});
```

### Delete File or Folder
To delete a file or folder from a remote directory:
```javascript
// delete the first file from the root folder
await bunny.delete({remoteDirectory: remoteFileDirectory, fileName: fileName});
```

### Upload Folder
To upload a complete local folder:
```javascript
// upload all files from the ./testDownload folder to the remote /testRemoteFolderUpload folder, except .html files
await bunny.uploadFolder({
  localDirectory: './testDownload',
  remoteDirectory: 'testRemoteFolderUpload',
  recursive: true,
  excludedFileTypes: ['.html'],
  fileFilter: (filepath) => {
    // filter out first file from being uploaded
    return !filepath.includes(fileName)
  }
});
```

### Download Folder
To download a complete remote folder:
```javascript
// download all files from the remote folder including subdirectories to the ./testDownload/downloadFolderTest folder, except .png and .jpg files
const downloadedFilesPaths = await bunny.downloadFolder({
  remoteDirectory: '/',
  localDirectory: './testDownload/downloadFolderTest',
  recursive: true,
  excludedFileTypes: ['.png', '.jpg'],
  fileFilter: (filepath) => {
    // filter out the uploaded file from being downloaded
    return !filepath.includes('testRemoteFolderUpload')
  }
});
```

## Example
For a full example, look at the test.js script.

## License
GNU General Public License v3.0
