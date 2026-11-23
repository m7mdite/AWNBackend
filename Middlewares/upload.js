const multer = require('multer');
const path = require('path');
const fs = require('fs');

// تخزين الصور في مجلد /images
const storageProfile = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../images/profile'));
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s/g, '');
        cb(null, uniqueName);
    }
});

//requests photo
const storageRequest = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../images/requests'));
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s/g, '');
        cb(null, uniqueName);
    }
});

//verify request photo
const storageVerifyRequest = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../images/verify_requests'));
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s/g, '');
        cb(null, uniqueName);
    }
});
//conversation photo
const storageConversation = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../images/conversation'));
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s/g, '');
        cb(null, uniqueName);
    }
});

// posts photo
const storagePosts = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../images/posts'));
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s/g, '');
        cb(null, uniqueName);
    }
});

// ===== صور الحالة (قبل / بعد المعالجة) =====
const storageCase = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../images/cases');
        fs.mkdirSync(dir, { recursive: true }); // ينشئ المجلد تلقائياً إذا غير موجود
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = (file.originalname.toLowerCase().match(/\.[0-9a-z]+$/) || ['.jpg'])[0];
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    }
});
// فلتر للتحقق من نوع الملف
const fileFilter = (req, file, cb) => {
    const allowedExtensions=['.jpg','.jpeg','.png','.gif','.webp','bmp','mp4'];
    const extentions=file.originalname.toLowerCase().match(/\.[0-9a-z]+$/)?.[0] || '';
    if (allowedExtensions.includes(extentions)) {
        cb(null, true);
    } else {
        cb(new Error('File type not supported'), false);
    }
};

// صور فقط (بدون فيديو) لأنها صور طبية
const imageOnlyFilter = (req, file, cb) => {
    const ext = (file.originalname.toLowerCase().match(/\.[0-9a-z]+$/) || [''])[0];
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    if (allowedExtensions.includes(ext) && /^image\//.test(file.mimetype || '')) {
        cb(null, true);
    } else {
        cb(new Error('INVALID_IMAGE_TYPE'), false);
    }
};

const uploadCasePhotoMulter = multer({
    storage: storageCase,
    fileFilter: fileFilter,
    limits: { fileSize: 1024 * 1024 * 5 } // حد 5 ميجا
});

// middleware جاهز: يرجع رسالة JSON واضحة بدل خطأ عام
const uploadCasePhotoSingle = (req, res, next) => {
    uploadCasePhotoMulter.single('photo')(req, res, (err) => {
        if (!err) return next();
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        console.log(err.code);
        return res.status(400).json({
            status: 'error',
            message: tooBig
                ? 'حجم الصورة يتجاوز 5 ميجا'
                : 'نوع الملف غير مدعوم، المسموح: jpg, png, webp'
        });
    });
};



// multer to upload profile photo
const uploadProfilePhoto = multer({
    storage:storageProfile,
    fileFilter,
    limits: { fileSize: 1024 * 1024 * 5 } // حد 5 ميجا
});

// multer to upload request photo

const uploadRequestPhoto = multer({
    storage:storageRequest,
    fileFilter,
    limits: { fileSize: 1024 * 1024 * 5 } // حد 5 ميجا
});

// multer to upload verify request photo
const uploadVerifyRequestPhoto = multer({
    storage:storageVerifyRequest,
    fileFilter,
    limits: { fileSize: 1024 * 1024 * 5 } // حد 5 ميجا
});
// multer to upload conversation photo
const uploadConversationPhoto = multer({
    storage:storageConversation,
    fileFilter,
    limits: { fileSize: 1024 * 1024 * 5 } // حد 5 ميجا
});
// multer to upload post photos
const uploadPostPhoto = multer({
    storage:storagePosts,
    fileFilter,
    limits: { fileSize: 1024 * 1024 * 5 } // حد 5 ميجا
});

module.exports = {uploadProfilePhoto,uploadRequestPhoto,uploadVerifyRequestPhoto,uploadConversationPhoto,uploadPostPhoto,uploadCasePhotoSingle};

