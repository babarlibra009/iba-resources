require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { ContainerClient } = require('@azure/storage-blob');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Configuration
const STORAGE_ACCOUNT = "babar25154";
const CONTAINER_NAME = "work1";
const SAS_TOKEN = "sp=racwdli&st=2025-05-07T17:48:11Z&se=2025-05-15T01:48:11Z&spr=https&sv=2024-11-04&sr=c&sig=krGM8qqwodgXrXnaKpA5fl6ZJYp38N765lG%2FZ0pCblk%3D";

// Initialize clients
const containerUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}`;
const containerClient = new ContainerClient(`${containerUrl}?${SAS_TOKEN}`);

// Verify container access
async function verifyContainerAccess() {
  try {
    const iterator = containerClient.listBlobsFlat();
    await iterator.next();
    console.log("Successfully connected to Azure Blob Storage");
    return true;
  } catch (error) {
    console.error("Container access verification failed:", error.message);
    return false;
  }
}

// App configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Verify connection on startup
verifyContainerAccess();

// Routes
app.get('/', async (req, res) => {
    try {
      const files = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        const blobClient = containerClient.getBlobClient(blob.name);
        const properties = await blobClient.getProperties(); // Get full properties
        
        files.push({
          name: blob.name,
          url: `${containerUrl}/${encodeURIComponent(blob.name)}?${SAS_TOKEN}`,
          properties: {
            contentLength: properties.contentLength,
            lastModified: properties.lastModified,
            contentType: properties.contentType
          }
        });
      }
      res.render('index', { files });
    } catch (error) {
      console.error('Error listing blobs:', error.message);
      res.status(500).send(`Error retrieving files. Details: ${error.message}`);
    }
  });

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  try {
    const blobName = Date.now() + '-' + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '');
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(req.file.buffer, req.file.size);
    res.redirect('/');
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).send(`Upload failed: ${error.message}`);
  }
});

app.get('/download/:filename', async (req, res) => {
  try {
    const blobClient = containerClient.getBlobClient(req.params.filename);
    const downloadResponse = await blobClient.download();
    
    res.setHeader('Content-Type', downloadResponse.contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.filename}`);
    downloadResponse.readableStreamBody.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error.message);
    res.status(500).send(`Error downloading file: ${error.message}`);
  }
});

app.get('/delete/:filename', async (req, res) => {
  try {
    await containerClient.deleteBlob(req.params.filename);
    res.redirect('/');
  } catch (error) {
    console.error('Error deleting file:', error.message);
    res.status(500).send(`Error deleting file: ${error.message}`);
  }
});

app.get('/view/:filename', async (req, res) => {
    try {
      const blobClient = containerClient.getBlobClient(req.params.filename);
      
      // Generate a new SAS token with read permission for this specific blob
      const blobSasUrl = await generateBlobSasUrl(blobClient);
      res.redirect(blobSasUrl);
    } catch (error) {
      console.error('Error generating view URL:', error.message);
      res.status(500).send(`Error viewing file: ${error.message}`);
    }
  });
  
  // Helper function to generate SAS URL for a blob
  async function generateBlobSasUrl(blobClient) {
    const startsOn = new Date();
    const expiresOn = new Date(startsOn);
    expiresOn.setHours(startsOn.getHours() + 1); // 1 hour expiry
  
    return `${blobClient.url}?${SAS_TOKEN}`; // Using your existing SAS token
  }

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Application error:', err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IBA Resources app running on http://localhost:${PORT}`);
  console.log(`Connected to Azure Container: ${containerUrl}`);
});