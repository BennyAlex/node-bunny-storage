import BunnyCDNStorage from './index.mjs';

async function main() {
  const bunny = new BunnyCDNStorage(process.env.TEST_API_KEY, process.env.TEST_STORAGE_NAME, 6, 1);
  
  // List files
  console.log('Listing files...');
  const files = await bunny.listFiles('/', true); // list all files from root folder recursively
  console.log('All found files:', files);
  
  // Download a file
  console.log('Downloading file...');
  // download the first file from the root folder
  const downloadedFilePath = await bunny.downloadFile('/', files[0].ObjectName, './testDownload/singleFileTestDownload');
  console.log('File downloaded to:', downloadedFilePath);
  
  // Upload a file
  console.log('Uploading file ' + files[0].ObjectName + ' ...');
  // upload the file to /testRemoteSingleFileUpload folder
  await bunny.uploadFile('./testDownload/singleFileTestDownload/' + files[0].ObjectName, 'testRemoteSingleFileUpload');
  
  // Delete a file
  console.log('Deleting file...');
  // delete the first file from the root folder
  await bunny.delete('/', files[0].ObjectName);
  
  // Upload many files
  console.log('Uploading folder...');
  // upload all files from the ./testDownload folder to the remote /testRemoteFolderUpload folder, except .html files
  await bunny.uploadFolder('./testDownload', 'testRemoteFolderUpload', true, ['.html']);
  
  // Download many files
  console.log('Downloading folder...');
  // download all files from the remote folder including subdirectories to the ./testDownload/downloadFolderTest folder, except .png and .jpg files
  const downloadedFilesPaths = await bunny.downloadFolder('/', './testDownload/downloadFolderTest', true, ['.png', '.jpg']);
  console.log('All downloaded files:', downloadedFilesPaths);
  
  console.log('TEST FINISHED');
}

main().catch(console.error);
