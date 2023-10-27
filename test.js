import BunnyCDNStorage from './index.mjs';

async function main() {
  const bunny = new BunnyCDNStorage({
    accessKey: process.env.TEST_API_KEY,
    storageZoneName: process.env.TEST_STORAGE_NAME,
    concurrency: 24,
    retryCount: 3,
    logLevel: 'info'
  });
  // List files
  console.log('Listing files...');
  // list all files from root folder recursively
  const files = await bunny.listFiles({
    remoteDirectory: '/', recursive: true
  });

  console.log('Total number of found files:', files.length);

  // download the first file from the root folder, get the remote file path using the getCompleteRemotePathFromFile function
  const remoteFileDirectory = bunny.getRemotePathFromFileWithoutStorageZone(files[0]);
  const fileName = files[0].ObjectName;

  console.log('First file:', fileName, '| in directory:', remoteFileDirectory)

  // Download a file
  console.log('Downloading file...');
  const downloadedFilePath = await bunny.downloadFile({
    remoteDirectory: remoteFileDirectory, fileName: fileName, localDirectory: './testDownload/singleFileTestDownload'
  });
  console.log('File downloaded to:', downloadedFilePath);

  // Upload a file
  console.log('Uploading file ' + fileName + ' ...');
  // upload the file to /testRemoteSingleFileUpload folder
  await bunny.uploadFile({
    localFilePath: './testDownload/singleFileTestDownload/' + fileName,
    remoteDirectory: 'testRemoteSingleFileUpload'
  });

  // Delete a file
  console.log('Deleting file...');
  // delete the first file from the root folder
  await bunny.delete({
    remoteDirectory: remoteFileDirectory, fileName: fileName
  });

  // Upload many files
  console.log('Uploading folder...');
  // upload all files from the ./testDownload folder to the remote /testRemoteFolderUpload folder, except .md files
  await bunny.uploadFolder({
    localDirectory: './testDownload',
    remoteDirectory: 'testRemoteFolderUpload',
    recursive: true,
    excludedFileTypes: ['.md'],
    fileFilter: (filepath) => {
      // filter out first file from being uploaded
      return !filepath.includes(fileName)
    }
  });

  // Download many files
  console.log('Downloading complete root folder recursively, excluding testRemoteFolderUpload folder...');
  // download all files from the remote folder including subdirectories to the ./testDownload/downloadFolderTest folder, except .md files
  const downloadedFilesPaths = await bunny.downloadFolder({
    remoteDirectory: '/',
    localDirectory: './testDownload/downloadFolderTest',
    recursive: true,
    excludedFileTypes: ['.md'],
    fileFilter: (filepath) => {
      // filter out the uploaded file from being downloaded
      return !filepath.includes('testRemoteFolderUpload')
    }
  });

  console.log('All downloaded files:', downloadedFilesPaths);

  console.log('TEST FINISHED');
}

main().catch((err) => {
  console.log(err);
});
