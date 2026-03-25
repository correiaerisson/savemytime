const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.static('public')); // Serve frontend files

// Configure Multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: { 
        fileSize: 50 * 1024 * 1024 // 50 MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow only text, image, or audio
        if (file.mimetype.startsWith('text/') || 
            file.mimetype.startsWith('image/') ||
            file.mimetype === 'application/pdf' || 
            file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only text, image, and audio are allowed.'));
        }
    }
});

// In-memory database to link random UUIDs to file paths
// Note: For production, use Redis or a real database
const fileStore = new Map();

// Function to generate a random 6-character code
function generateShortCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Route: Upload 1 single file
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or invalid file type.' });
    }

    // Generate a unique 6-character ID
    let fileId = generateShortCode();
    // Ensure it's unique (extremely rare to collide, but good practice)
    while (fileStore.has(fileId)) {
        fileId = generateShortCode();
    }
    
    // Store file info
    fileStore.set(fileId, {
        path: req.file.path,
        originalName: req.file.originalname
    });

    // Create the access URL using the short code
    const accessUrl = `${req.protocol}://${req.get('host')}/download/${fileId}`;
    
    // 5-Minute Self-Destruct Timer
    setTimeout(() => {
        if (fileStore.has(fileId)) {
            const fileInfo = fileStore.get(fileId);
            fs.unlink(fileInfo.path, (err) => {
                if (err) console.error("Error auto-deleting file:", err);
            });
            fileStore.delete(fileId);
            console.log(`Time's up! File ${fileId} auto-destroyed.`);
        }
    }, 5 * 60 * 1000);

    // Send back both the URL and the raw code
    res.json({ url: accessUrl, code: fileId });
});

// Route: Download and Burn
app.get('/download/:id', (req, res) => {
    const fileId = req.params.id;

    // Check if file exists
    if (!fileStore.has(fileId)) {
        return res.status(404).send('<h1>File not found or has already been accessed and deleted.</h1>');
    }

    const fileInfo = fileStore.get(fileId);

    // Send the file to the user
    res.download(fileInfo.path, fileInfo.originalName, (err) => {
        if (err) {
            console.error("Error downloading file:", err);
        } else {
            // BURN AFTER READING: Delete from disk and memory after successful transfer
            fs.unlink(fileInfo.path, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting file from disk:", unlinkErr);
            });
            fileStore.delete(fileId);
            console.log(`File ${fileId} securely destroyed.`);
        }
    });
});

// Create uploads folder if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});