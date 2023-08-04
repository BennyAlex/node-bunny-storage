import axios from 'axios';
import axiosRetry from 'axios-retry';
import fse from "fs-extra";
import path from 'path';
import pLimit from 'p-limit';

class BunnyCDNStorage {
  /**
   * @param {string} accessKey Your storage zone API access key. This is also your ftp password shown in the bunny dashboard.
   * @param {string} storageZoneName The name of your storage zone.
   * @param {number} [concurrency=8] The max number of concurrent connections used for uploading and downloading folders. Defaults to 8.
   * @param {number} [retryCount=2] The number of times to retry a failed request.
   */
  constructor(accessKey, storageZoneName, concurrency = 8, retryCount = 2) {
    this.accessKey = accessKey;
    this.storageZoneName = storageZoneName;
    this.baseURL = 'https://storage.bunnycdn.com/';
    this.limit = pLimit(concurrency);
    
    // Setup axios-retry
    axiosRetry(axios, {retries: retryCount});
  }
  
  /**
   * Get the file path for a file.
   * @param {string} directory - The remote directory path.
   * @param {string} fileName - The name of the file.
   * @returns {string} The remote file path.
   * @private
   */
  _getFilePath(directory, fileName) {
    let filePath = '';
    
    if (directory && directory !== '/') {
      if (directory.startsWith('/')) directory = directory.slice(1);
      if (directory.endsWith('/')) directory = directory.slice(0, -1);
      filePath += `${directory}/`;
    }
    
    if (fileName) {
      if (fileName.startsWith('/')) fileName = fileName.slice(1);
      if (fileName.endsWith('/')) fileName = fileName.slice(0, -1);
      filePath += fileName;
    }
    
    return filePath;
  }
  
  /**
   * Generate the full storage URL for a file for the BunnyCDN API.
   * @param {string} directory - The remote directory path.
   * @param {string} [fileName] - The name of the file.
   * @return {string} The remote storage URL.
   * @private
   */
  _getFullStorageUrl(directory, fileName) {
    const filePath = this._getFilePath(directory, fileName);
    return `${this.baseURL}${this.storageZoneName}/` + filePath;
  }
  
  /**
   * Get the remote path for a file.
   * @param file
   * @returns {string} The remote path without the storage zone name.
   * @private
   */
  _getRemotePathFromFileWithoutStorageZone(file) {
    const remotePath = file.Path;
    if (remotePath.startsWith('/' + this.storageZoneName + '/')) return remotePath.slice(this.storageZoneName.length + 2);
    return remotePath;
  }
  
  
  /**
   * List all files in a directory.
   * @param {string} [remoteDirectory='/'] The directory path. Leave blank or use '/' to list files in the root directory.
   * @param {boolean} [recursive=false] Should the list go through each subdirectory recursively.
   */
  async listFiles(remoteDirectory = '/', recursive = false) {
    const url = this._getFullStorageUrl(remoteDirectory);
    
    console.log(`Listing files in ${url}`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': 'application/json'
        }
      });
      
      let allFiles = response.data;
      
      if (recursive) {
        for (const file of response.data) {
          if (file.IsDirectory) {
            const subFiles = await this.listFiles(this._getRemotePathFromFileWithoutStorageZone(file) + file.ObjectName, recursive);
            allFiles = [...allFiles, ...subFiles];
          }
        }
      }
      
      return allFiles;
    } catch (error) {
      console.error(`Error listing files: ${error}`);
      throw error;
    }
  }
  
  /**
   * Upload a file to BunnyCDN storage.
   * @param {string} [localFilePath='.'] - The local file path. Defaults to the current directory.
   * @param {string} [remoteDirectory='/']  - The remote directory path. Leave blank or use '/' to upload to the root directory.
   */
  async uploadFile(localFilePath = '.', remoteDirectory = '/') {
    const fileExists = await fse.pathExists(localFilePath);
    if (!fileExists) {
      throw new Error(`Upload failed: File does not exist: ${localFilePath}`);
    }
    
    const fileData = fse.createReadStream(localFilePath);
    const fileName = path.basename(localFilePath); // Extract the file name from the local file path
    
    const url = this._getFullStorageUrl(remoteDirectory, fileName);
    
    // console.log(`Uploading ${localFilePath} to ${url}`);
    
    const config = {
      headers: {
        'AccessKey': this.accessKey,
        'Content-Type': 'application/octet-stream'
      }
    };
    
    try {
      return await axios.put(url, fileData, config);
    } catch (error) {
      if (error.response) {
        throw new Error(`Error: ${error.response.status}`);
      } else if (error.request) {
        throw new Error('No response was received');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Download a file from BunnyCDN storage.
   * @param {string} [remoteDirectory='/']  - The remote directory path. Leave blank or use '/' to download a file from the root directory.
   * @param {string} fileName - The name of the file to download.
   * @param {string} [localDirectory='.'] - The local directory to download the file to. Defaults to the current directory.
   * @returns {Promise<string>} - Returns a promise that resolves with the local file path of the downloaded file.
   */
  async downloadFile(remoteDirectory = '/', fileName, localDirectory = '.') {
    if (!fileName) throw new Error('downloadFile: No file name provided');
    
    const url = this._getFullStorageUrl(remoteDirectory, fileName);
    
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'AccessKey': this.accessKey
      }
    });
    
    // console.log(`Download response for ${fileName}:`, response.status, response.statusText);
    
    const localPath = path.join(localDirectory, fileName);
    
    console.log('downloadFile localPath:', localPath);
    
    await fse.ensureDir(localDirectory);
    
    // Create a writable stream and pipe the response data to it
    const fileStream = fse.createWriteStream(localPath);
    response.data.pipe(fileStream);
    
    // Return a promise that resolves when the file has finished downloading
    return new Promise((resolve, reject) => {
      fileStream.on('finish', () => resolve(localPath));
      fileStream.on('error', reject);
    });
  }
  
  
  /**
   * Delete a file from BunnyCDN storage.
   * @param {string} [remoteDirectory='/'] - The remote directory path. Leave blank or use '/' to delete a file from the root directory.
   * @param {string} fileName - The name of the file to delete. If it is a directory, the directory and all files in the directory will be deleted. If remoteDirectory and fileName are blank, all files in the storage zone will be deleted.
   */
  async delete(remoteDirectory = '/', fileName) {
    try {
      const response = await axios.delete(this._getFullStorageUrl(remoteDirectory, fileName), {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': 'application/json'
        }
      });
      
      // console.log(`Delete response for ${fileName}:`, response.status, response.statusText);
      
      return response.data;
    } catch (error) {
      console.error(`Error deleting file: ${error}`);
      throw error;
    }
  }
  
  /**
   * Get all filenames in a local directory.
   * @param root
   * @param dir
   * @param recursive
   * @returns {Promise<*[]>}
   * @private
   */
  async _getLocalFiles(root, dir = root, recursive = false) {
    let files = [];
    try {
      const items = await fse.readdir(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const itemStat = await fse.stat(fullPath);
        if (itemStat.isDirectory()) {
          if (recursive) files = files.concat(await this._getLocalFiles(root, fullPath));
        } else {
          const relativePath = path.relative(root, fullPath);
          files.push(relativePath);
        }
      }
    } catch (err) {
      console.log(`Error reading directory ${dir}: ${err}`);
      process.exit(1);
    }
    return files;
  }
  
  /**
   * Upload many files to BunnyCDN storage.
   * @param {string} [localDirectory ='./']- The local directory path. Defaults to the current directory.
   * @param {string} [remoteDirectory='/']  - The remote directory path. Leave blank or use '/' to upload files to the root directory.
   * @param {boolean} [recursive=false] - Include local subdirectories.
   */
  async uploadFolder(localDirectory = './', remoteDirectory = '/', recursive = false) {
    const dirExists = await fse.pathExists(localDirectory);
    if (!dirExists) {
      throw new Error(`uploadFolder failed: local directory does not exist: ${localDirectory}`);
    }
    
    // Read all files from the local directory
    const fileNames = await this._getLocalFiles(localDirectory, localDirectory, recursive);
    
    console.log('Files to upload:', fileNames);
    
    // Upload all files concurrently with limit
    await Promise.all(fileNames.map((fileName) => {
      return this.limit(async () => {
        const filePath = path.join(localDirectory, fileName);
        
        await this.uploadFile(filePath, remoteDirectory);
        
        if (recursive && fse.lstatSync(filePath).isDirectory()) {
          await this.uploadFolder(filePath, path.join(remoteDirectory, fileName), recursive);
        }
      });
    }));
  }
  
  /**
   * @param {string} [remoteDirectory='/']  The remote directory path. Leave blank or use '/' to download files from the root directory.
   * @param {string} [localDirectory='.'] The local directory path where the downloaded files should be saved. Defaults to the current directory.
   * @param {boolean} recursive Should the operation be performed recursively.
   */
  async downloadFolder(remoteDirectory = '/', localDirectory = '.', recursive = false) {
    try {
      const files = await this.listFiles(remoteDirectory, recursive);
      const filesToDownload = files.filter((file) => file.IsDirectory === false);
      
      console.log('Files to download:', filesToDownload);
      
      const downloads = [];
      for (const file of filesToDownload) {
        downloads.push(this.limit(async () => {
          const remotePath = this._getRemotePathFromFileWithoutStorageZone(file);
          console.log('remotePath:', remotePath);
          
          let downloadDestination = localDirectory;
          
          if (recursive && remotePath) downloadDestination = path.join(localDirectory, remotePath);
          
          console.log('downloadFolder downloadDestination:', downloadDestination);
          
          return await this.downloadFile(this._getRemotePathFromFileWithoutStorageZone(file), file.ObjectName, downloadDestination);
        }));
      }
      
      return await Promise.all(downloads);
    } catch (error) {
      console.error(`Error downloading files: ${error}`);
      throw error;
    }
  }
}

export default BunnyCDNStorage;
