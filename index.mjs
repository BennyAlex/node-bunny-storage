import axios from 'axios';
import axiosRetry from 'axios-retry';
import fse from "fs-extra";
import path from 'path';
import {createLogger, format, transports} from 'winston';
import {Sema} from "async-sema";

const logFormat = format.printf(({level, message, label, timestamp}) => {
  return `${format.colorize().colorize(level, '[' + level + ']')} ${format.colorize().colorize('debug', timestamp)}: ${message}`;
});

class BunnyCDNStorage {
  /**
   * @param {object} options  The options object.
   * @param {string} options.accessKey Your storage zone API access key. This is also your ftp password shown in the bunny dashboard.
   * @param {string} options.storageZoneName The name of your storage zone.
   * @param {number} [options.concurrency=16] The max number of concurrent connections used for listing files (when recursive is true) as well for uploading and downloading folders. Defaults to 16.
   * @param {number} [options.retryCount=2] The number of times to retry a failed request.
   * @param {string} [options.logLevel='error'] The log level for this module. Can be 'info', 'error' or 'silent'. Defaults to 'error'.
   */
  constructor({accessKey, storageZoneName, concurrency = 16, retryCount = 2, logLevel = 'error' }) {
    this.accessKey = accessKey;
    this.storageZoneName = storageZoneName;
    this.baseURL = 'https://storage.bunnycdn.com/';
    this.sema = new Sema(concurrency);

    this.logger = createLogger({
      level: logLevel,
      format: format.combine(
        format.timestamp(),
        logFormat
      ),
      transports: [
        new transports.Console({
          silent: logLevel === 'silent'
        })
      ]
    });
    
    // Setup axios-retry
    axiosRetry(axios, {
      retries: retryCount, retryDelay: (numberOfRetries) => {
        return numberOfRetries * 2000;
      }
    });
  }
  
  /**
   * Get the file path for a file.
   * @param {string} directory - The remote directory path.
   * @param {string} fileName - The name of the file.
   * @returns {string} The remote file path.
   * @private
   */
  _getFilePath(directory, fileName) {
    try {
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
    } catch (error) {
      this.logger.error(`Failed to generate file path for ${directory} and ${fileName}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Generate the full storage URL for a file for the BunnyCDN API.
   * @param {string} directory - The remote directory path.
   * @param {string} [fileName] - The name of the file.
   * @return {string} The remote storage URL.
   * @private
   */
  _getFullStorageUrl(directory, fileName) {
    try {
      const filePath = this._getFilePath(directory, fileName);
      return `${this.baseURL}${this.storageZoneName}/` + filePath;
    } catch (error) {
      this.logger.error(`Failed to generate full storage URL for ${directory} and ${fileName}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Get the remote path for a file without the storage zone name. Does not include the file name.
   * @param file
   * @returns {string} The remote path without the storage zone name. Does not include the file name.
   */
  getRemotePathFromFileWithoutStorageZone(file) {
    try {
      let remotePath = file.Path;
      if (remotePath.startsWith('/' + this.storageZoneName + '/')) remotePath = remotePath.slice(this.storageZoneName.length + 2);
      if (!remotePath) return '/';
      return remotePath;
    } catch (error) {
      this.logger.error(`Failed to get remote path from file ${file}: ${error}`);
      throw error;
    }
  }
  
  /**
   * List all files in a directory.
   * @param {object} options The options object.
   * @param {string} [options.remoteDirectory='/'] The directory path. Leave blank or use '/' to list files in the root directory.
   * @param {boolean} [options.recursive=false] Should the list go through each subdirectory recursively.
   */
  async listFiles({remoteDirectory = '/', recursive = false}) {
    try {
      const url = this._getFullStorageUrl(remoteDirectory);
      
      this.logger.info(`Listing files in ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': 'application/json'
        }
      });
      
      const files = [];
      
      for (const file of response.data) {
        if (file.IsDirectory && recursive) {
          const subFiles = await this.listFiles({
            remoteDirectory: this.getRemotePathFromFileWithoutStorageZone(file) + file.ObjectName,
            recursive
          });
          for (const subFile of subFiles) {
            files.push(subFile);
          }
        } else {
          files.push(file);
        }
      }
      
      this.logger.info(`Found ${files.length} files in ${url}`);
      return files;
    } catch (error) {
      this.logger.error(`Failed to list files in ${remoteDirectory}: ${error}. URL: ${this._getFullStorageUrl(remoteDirectory)}`);
      throw error;
    }
  }
  
  /**
   * Upload a file to BunnyCDN storage.
   * @param {object} options The options object.
   * @param {string} [options.localFilePath='.'] - The local file path. Defaults to the current directory.
   * @param {string} [options.remoteDirectory='/']  - The remote directory path. Leave blank or use '/' to upload to the root directory.
   */
  async uploadFile({localFilePath = '.', remoteDirectory = '/'}) {
    try {
      const fileExists = await fse.pathExists(localFilePath);
      if (!fileExists) {
        this.logger.error(`Upload failed: File does not exist: ${localFilePath}`);
        throw new Error(`Upload failed: File does not exist: ${localFilePath}`);
      }
      
      this.logger.info(`Uploading ${localFilePath} to ${remoteDirectory}`);
      
      const fileData = fse.createReadStream(localFilePath);
      const fileName = path.basename(localFilePath); // Extract the file name from the local file path
      
      const url = this._getFullStorageUrl(remoteDirectory, fileName);
      
      const config = {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': 'application/octet-stream'
        }
      };
      
      return await axios.put(url, fileData, config);
    } catch (error) {
      this.logger.error(`uploadFile Error: ${error}, localFilePath: ${localFilePath}, remoteDirectory: ${remoteDirectory}. URL: ${this._getFullStorageUrl(remoteDirectory, path.basename(localFilePath))}`);
      throw error;
      
    }
  }
  
  /**
   * Download a file from BunnyCDN storage.
   * @param {object} options The options object.
   * @param {string} [options.remoteDirectory='/']  - The remote directory path. Leave blank or use '/' to download a file from the root directory.
   * @param {string} options.fileName - The name of the file to download.
   * @param {string} [options.localDirectory='.'] - The local directory to download the file to. Defaults to the current directory.
   * @returns {Promise<string>} - Returns a promise that resolves with the local file path of the downloaded file.
   */
  async downloadFile({remoteDirectory = '/', fileName, localDirectory = '.'}) {
    try {
      if (!fileName) {
        this.logger.error('downloadFile: No file name provided');
        throw new Error('downloadFile: No file name provided');
      }
      
      this.logger.info(`Downloading ${fileName} from ${remoteDirectory}`);
      
      const url = this._getFullStorageUrl(remoteDirectory, fileName);
      
      const response = await axios.get(url, {
        responseType: 'stream',
        headers: {
          'AccessKey': this.accessKey
        }
      });
      
      const localPath = path.join(localDirectory, fileName);
      
      await fse.ensureDir(localDirectory);
      
      // Create a writable stream and pipe the response data to it
      const fileStream = fse.createWriteStream(localPath);
      response.data.pipe(fileStream);
      
      // Return a promise that resolves when the file has finished downloading
      return new Promise((resolve, reject) => {
        fileStream.on('finish', () => {
          this.logger.info(`Downloaded ${fileName} to ${localPath}`);
          resolve(localPath);
        });
        fileStream.on('error', () => {
          this.logger.error(`Error downloading ${fileName} to ${localPath}. URL: ${url}`);
          reject(localPath);
        });
      });
    } catch (error) {
      this.logger.error(`downloadFile Error:: ${error}, remoteDirectory: ${remoteDirectory}, fileName: ${fileName}, localDirectory: ${localDirectory}, url: ${this._getFullStorageUrl(remoteDirectory, fileName)}`);
      throw error;
    }
  }
  
  
  /**
   * Delete a file from BunnyCDN storage.
   * @param {object} options The options object.
   * @param {string} [options.remoteDirectory='/'] - The remote directory path. Leave blank or use '/' to delete a file from the root directory.
   * @param {string} options.fileName - The name of the file to delete. If it is a directory, the directory and all files in the directory will be deleted. If remoteDirectory and fileName are blank, all files in the storage zone will be deleted.
   */
  async delete({remoteDirectory = '/', fileName}) {
    try {
      if (!fileName) {
        this.logger.error('delete: No file name provided');
        throw new Error('delete: No file name provided');
      }
      this.logger.info(`Deleting ${fileName} from ${remoteDirectory}`);
      const url = this._getFullStorageUrl(remoteDirectory, fileName);
      await axios.delete(url, {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': 'application/json'
        }
      });
      
      this.logger.info(`Deleted ${fileName} from ${remoteDirectory}, it's url was ${url}`);
      return url;
    } catch (error) {
      this.logger.error(`delete Error: ${error}, remoteDirectory: ${remoteDirectory}, file: ${fileName}, url: ${this._getFullStorageUrl(remoteDirectory, fileName)}`);
      throw error;
    }
  }
  
  /**
   * Upload many files to BunnyCDN storage.
   * @param {object} options The options object.
   * @param {string} [options.localDirectory ='./']- The local directory path. Defaults to the current directory.
   * @param {string} [options.remoteDirectory='/']  - The remote directory path. Leave blank or use '/' to upload files to the root directory.
   * @param {boolean} [options.recursive=false] - Include local subdirectories.
   * @param {string[]} [options.excludedFileTypes=[]] - File types to exclude from the upload.
   * @param {function} options.fileFilter - Can be used to exclude individual files. The function receives the filepath as a parameter. If the callback returns false, the file will not be uploaded.
   */
  async uploadFolder({localDirectory = './', remoteDirectory = '/', recursive = false, excludedFileTypes = [], fileFilter}) {
    try {
      const dirExists = await fse.pathExists(localDirectory);
      if (!dirExists) {
        this.logger.error(`uploadFolder failed: local directory does not exist: ${localDirectory}`);
        throw new Error(`uploadFolder failed: local directory does not exist: ${localDirectory}`);
      }
      
      this.logger.info(`Uploading files from ${localDirectory} to ${remoteDirectory}`);
      
      // Read all files from the local directory
      let items = await fse.readdir(localDirectory);
      
      const uploadedFiles = [];
      
      for (const item of items) {
        const fullPath = path.join(localDirectory, item);
        const relativePath = path.relative(localDirectory, fullPath);
        const itemStat = await fse.stat(fullPath);
        
        if (itemStat.isDirectory()) {
          if (recursive) {
            const newRemoteDirectory = path.join(remoteDirectory, relativePath);
            const uploads = await this.uploadFolder({
              localDirectory: fullPath,
              remoteDirectory: newRemoteDirectory,
              recursive,
              excludedFileTypes,
              fileFilter
            });
            uploadedFiles.push(...uploads);
          }
        } else {
          // Filter out excluded file types
          if (excludedFileTypes?.length) {
            const ext = path.extname(relativePath);
            if (excludedFileTypes.includes(ext)) continue;
          }

          // Filter out files using the fileFilter function
          if (fileFilter) {
            const shouldUpload = fileFilter(relativePath);
            if (!shouldUpload) continue;
          }
          
          await this.uploadFile({
            localFilePath: fullPath,
            remoteDirectory
          });
          
          uploadedFiles.push(fullPath);
          
          this.logger.info(`Uploaded ${fullPath} to ${remoteDirectory}`);
          this.sema.release();
        }
      }
      
      this.logger.info(`Uploaded ${uploadedFiles.length} files from ${localDirectory} to ${remoteDirectory}`);
      return uploadedFiles;
    } catch (error) {
      this.logger.error(`uploadFolder Error: ${error}, localDirectory: ${localDirectory}, remoteDirectory: ${remoteDirectory}`);
      throw error;
    }
  }
  
  /**
   * Download a folder from BunnyCDN storage.
   * @param {object} options The options object.
   * @param {string} [options.remoteDirectory='/']  The remote directory path. Leave blank or use '/' to download files from the root directory.
   * @param {string} [options.localDirectory='.'] The local directory path where the downloaded files should be saved. Defaults to the current directory.
   * @param {boolean} [options.recursive=fales] Should the operation be performed recursively.
   * @param {string[]} [options.excludedFileTypes=[]] Define file types that should not be downloaded, e.g. ['.pdf', '.jpg']
   * @param {function} options.fileFilter Can be used to exclude individual files. The function receives the remote filepath (without the storage zone) as a parameter. If the callback returns false, the file will not be downloaded.
   */
  async downloadFolder({remoteDirectory = '/', localDirectory = '.', recursive = false, excludedFileTypes = [], fileFilter}) {
    try {
      const files = await this.listFiles({
        remoteDirectory, recursive
      });
      
      // filter out directories and excluded file types
      const filesToDownload = files.filter((file) => {
          const fileExtension = path.extname(file.ObjectName);
          if (file.IsDirectory) return false;
          else if (excludedFileTypes?.length && excludedFileTypes.includes(fileExtension)) return false;
          else if (fileFilter) return fileFilter(this.getRemotePathFromFileWithoutStorageZone(file) + file.ObjectName);
          else return true;
        });

      const totalFilesToDownload = filesToDownload.length;

      this.logger.info(`Downloading ${totalFilesToDownload} files from ${remoteDirectory} to ${localDirectory}`);

      let downloadedCount = 0;
      const downloadPaths = [];

      for (const file of filesToDownload) {
        await this.sema.acquire();
        
        const remotePath = this.getRemotePathFromFileWithoutStorageZone(file);
        
        let downloadDestination = localDirectory;
        
        if (recursive && remotePath) downloadDestination = path.join(localDirectory, remotePath);
        
        const downloadPath = await this.downloadFile({
          remoteDirectory: remotePath,
          fileName: file.ObjectName,
          localDirectory: downloadDestination
        });
        downloadPaths.push(downloadPath);
        
        downloadedCount++;
        this.logger.info(`Downloaded ${downloadedCount} of ${totalFilesToDownload} files`);
        
        this.sema.release();
      }
      
      this.logger.info(`Downloaded ${downloadedCount} files from ${remoteDirectory} to ${localDirectory}`);
      return downloadPaths;
    } catch (error) {
      this.logger.error(`downloadFolder Error: ${error}, remoteDirectory: ${remoteDirectory}, localDirectory: ${localDirectory}`);
      throw error;
    }
  }
}

export default BunnyCDNStorage;
