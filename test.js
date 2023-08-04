import BunnyCDNStorage from './index.mjs';

async function main() {
  const bunny = new BunnyCDNStorage(process.env.TEST_API_KEY, process.env.TEST_STORAGE_NAME, 4, 1);
  
  // List files
  console.log('Listing files...');
  const files = await bunny.listFiles('/', true); // list all files from root folder recursively
  console.log('All found files:', files);
  
  // Download a file
  console.log('Downloading file...');
  const downloadedFilePath  = await bunny.downloadFile('/', files[0].ObjectName, './testDownload/singleFileTestDownload'); // download the first file from the root folder
  console.log('File downloaded to:', downloadedFilePath);
  
  // Upload a file
  console.log('Uploading file ' + files[0].ObjectName + ' ...');
  await bunny.uploadFile('./testDownload/singleFileTestDownload/' + files[0].ObjectName, 'testRemoteSingleFileUpload'); // upload the file to /testRemoteSingleFileUpload folder
  
  // Delete a file
  console.log('Deleting file...');
  await bunny.delete('/', files[0].ObjectName); // delete the first file from the root folder
  
  // Upload many files
  console.log('Uploading many files...');
  await bunny.uploadFolder('./testDownload', 'testRemoteFolderUpload', true); // upload all files from the ./testDownload folder to the remote /testRemoteFolderUpload folder
  
  // Download many files
  console.log('Downloading many files...');
  const downloadedFilesPaths = await bunny.downloadFolder('/', './testDownload/downloadFolderTest', true); // download all files from the remote folder including subdirectories to the ./testDownload/downloadFolderTest folder
  console.log('All downloaded files:', downloadedFilesPaths);
  
  console.log('TEST FINISHED');
}

main().catch(console.error);
