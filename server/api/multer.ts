import multer from "multer";

/** In-memory multer storage — files land on req.file.buffer */
export const upload = multer({ storage: multer.memoryStorage() });
