// ============ SUPABASE CONFIGURATION ============
const SUPABASE_URL = 'https://nycbxdeikgcmwjdddhjb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55Y2J4ZGVpa2djbXdqZGRkaGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDc2NTcsImV4cCI6MjA5Njc4MzY1N30.PZ25VzaCP79OGxJJw1y5xQHN0S58WZOUaNms0ZVpPx4';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ CONFIGURATION ============
const UPLOAD_PASSWORD = '280806';

// ============ STATE ============
let isAdmin = false;
let books = [];
let selectedFile = null;
let deleteBookId = null;
let currentPreviewBook = null;

// ============ INITIALIZATION ============
loadBooks();

async function loadBooks() {
    try {
        const { data, error } = await supabaseClient
            .from('books')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        books = data || [];
        renderBooks();
    } catch (error) {
        console.error('Error loading books:', error);
    }
}

// ============ RENDER BOOKS ============
function renderBooks() {
    const bookGrid = document.getElementById('bookGrid');
    const emptyState = document.getElementById('emptyState');
    const bookCount = document.getElementById('bookCount');
    
    bookCount.textContent = books.length + ' book' + (books.length !== 1 ? 's' : '');
    
    if (books.length === 0) {
        bookGrid.innerHTML = '';
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
        bookGrid.innerHTML = books.map(book => `
            <div class="book-card">
                <div class="book-icon">${getIcon(book.name)}</div>
                <div class="book-title" onclick="openPreview('${book.id}')" title="Click to preview">
                    ${escapeHtml(book.name)}
                </div>
                <div class="book-meta">
                    <span>📦 ${book.size}</span>
                    <span>📅 ${new Date(book.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    <span>⬇️ ${book.downloads || 0} downloads</span>
                </div>
                <div class="book-actions">
                    <button class="btn btn-ghost btn-sm" onclick="openPreview('${book.id}')">
                        👁️ Preview
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="downloadBook('${book.id}')">
                        ⬇️ Download
                    </button>
                    ${isAdmin ? `
                        <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${book.id}')">
                            🗑️
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
}

function getIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = { 'pdf': '📕', 'epub': '📗', 'mobi': '📘' };
    return icons[ext] || '📙';
}

// ============ PREVIEW FUNCTION ============
async function openPreview(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    
    currentPreviewBook = book;
    
    document.getElementById('previewTitle').textContent = book.name;
    document.getElementById('previewMeta').textContent = `📦 ${book.size} • ⬇️ ${book.downloads || 0} downloads`;
    document.getElementById('previewContainer').innerHTML = '<div class="preview-loading">Loading preview...</div>';
    document.getElementById('previewModal').classList.add('active');
    
    // Set download button
    document.getElementById('previewDownloadBtn').onclick = () => {
        downloadBook(book.id);
        closePreview();
    };
    
    try {
        const { data, error } = await supabaseClient
            .storage
            .from('ebooks')
            .download(book.storage_path);
        
        if (error) throw error;
        
        const ext = book.name.split('.').pop().toLowerCase();
        const blobUrl = URL.createObjectURL(data);
        
        if (ext === 'pdf') {
            // Show PDF preview
            document.getElementById('previewContainer').innerHTML = `
                <iframe src="${blobUrl}" width="100%" height="500px"></iframe>
            `;
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            // Show image preview
            document.getElementById('previewContainer').innerHTML = `
                <img src="${blobUrl}" alt="${book.name}">
            `;
        } else {
            // Show generic preview for EPUB, MOBI, etc.
            document.getElementById('previewContainer').innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 80px; margin-bottom: 20px;">📖</div>
                    <h3 style="color: var(--text-secondary); margin-bottom: 10px;">${escapeHtml(book.name)}</h3>
                    <p style="color: var(--text-muted);">Preview not available for this file type</p>
                    <p style="color: var(--text-muted); margin-top: 5px;">Click Download to get the full file</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Preview error:', error);
        document.getElementById('previewContainer').innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
                Unable to load preview. You can still download the file.
            </div>
        `;
    }
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
    document.getElementById('previewContainer').innerHTML = '<div class="preview-loading">Loading preview...</div>';
    currentPreviewBook = null;
}

// ============ DOWNLOAD ============
async function downloadBook(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    
    await supabaseClient
        .from('books')
        .update({ downloads: (book.downloads || 0) + 1 })
        .eq('id', bookId);
    
    try {
        const { data, error } = await supabaseClient
            .storage
            .from('ebooks')
            .download(book.storage_path);
        
        if (error) throw error;
        
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = book.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast('Download started!', 'success');
        loadBooks(); // Refresh to update download count
    } catch (error) {
        console.error('Download error:', error);
        toast('Download failed', 'error');
    }
}

// ============ UPLOAD ============
function openUploadModal() {
    if (!isAdmin) { openPasswordModal(); return; }
    document.getElementById('uploadModal').classList.add('active');
    resetUploadForm();
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
    resetUploadForm();
}

function resetUploadForm() {
    selectedFile = null;
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('progressBar').style.display = 'none';
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('uploadError').style.display = 'none';
    document.getElementById('progress').style.width = '0%';
    document.getElementById('fileInput').value = '';
}

// File selection events
document.getElementById('uploadArea').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('uploadArea').addEventListener('dragover', (e) => {
    e.preventDefault();
    e.target.classList.add('dragover');
});

document.getElementById('uploadArea').addEventListener('dragleave', (e) => {
    e.target.classList.remove('dragover');
});

document.getElementById('uploadArea').addEventListener('drop', (e) => {
    e.preventDefault();
    e.target.classList.remove('dragover');
    handleFileSelect(e.dataTransfer.files[0]);
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
    if (!file) return;
    
    const allowedExtensions = ['.pdf', '.epub', '.mobi'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
        showUploadError('Only PDF, EPUB, and MOBI files are allowed.');
        return;
    }
    
    if (file.size > 100 * 1024 * 1024) {
        showUploadError('File size must be less than 100MB.');
        return;
    }
    
    selectedFile = file;
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').style.display = 'flex';
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('uploadError').style.display = 'none';
}

document.getElementById('uploadBtn').addEventListener('click', uploadBook);

async function uploadBook() {
    if (!selectedFile || !isAdmin) return;
    
    const uploadBtn = document.getElementById('uploadBtn');
    const progressBar = document.getElementById('progressBar');
    const progress = document.getElementById('progress');
    
    uploadBtn.disabled = true;
    progressBar.style.display = 'block';
    progress.style.width = '0%';
    document.getElementById('uploadError').style.display = 'none';
    
    try {
        const uniqueId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const storagePath = uniqueId + '_' + selectedFile.name;
        
        let progressInterval = setInterval(() => {
            let currentWidth = parseFloat(progress.style.width) || 0;
            if (currentWidth < 85) progress.style.width = (currentWidth + Math.random() * 10) + '%';
        }, 300);
        
        const { error: uploadError } = await supabaseClient
            .storage
            .from('ebooks')
            .upload(storagePath, selectedFile);
        
        clearInterval(progressInterval);
        if (uploadError) throw uploadError;
        
        progress.style.width = '100%';
        
        const { error: dbError } = await supabaseClient
            .from('books')
            .insert([{
                id: uniqueId,
                name: selectedFile.name,
                size: formatFileSize(selectedFile.size),
                storage_path: storagePath,
                downloads: 0
            }]);
        
        if (dbError) throw dbError;
        
        setTimeout(() => {
            progressBar.style.display = 'none';
            uploadBtn.disabled = false;
            closeUploadModal();
            toast('Uploaded successfully!', 'success');
            loadBooks();
        }, 500);
        
    } catch (error) {
        console.error('Upload error:', error);
        showUploadError('Upload failed: ' + (error.message || 'Unknown error'));
        uploadBtn.disabled = false;
        progressBar.style.display = 'none';
    }
}

function showUploadError(message) {
    const el = document.getElementById('uploadError');
    el.textContent = message;
    el.style.display = 'block';
}

// ============ PASSWORD ============
function openPasswordModal() {
    document.getElementById('passwordModal').classList.add('active');
    document.getElementById('passwordError').style.display = 'none';
    document.getElementById('passwordInput').value = '';
    setTimeout(() => document.getElementById('passwordInput').focus(), 100);
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('active');
}

function verifyPassword() {
    if (document.getElementById('passwordInput').value === UPLOAD_PASSWORD) {
        isAdmin = true;
        closePasswordModal();
        renderBooks();
        toast('Admin access granted!', 'success');
    } else {
        document.getElementById('passwordError').textContent = 'Incorrect password.';
        document.getElementById('passwordError').style.display = 'block';
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
    }
}

// ============ DELETE ============
function openDeleteModal(bookId) {
    if (!isAdmin) { toast('Admin only!', 'error'); return; }
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    deleteBookId = bookId;
    document.getElementById('deleteBookName').textContent = book.name;
    document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    deleteBookId = null;
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!isAdmin || !deleteBookId) return;
    const book = books.find(b => b.id === deleteBookId);
    if (!book) return;
    
    try {
        await supabaseClient.storage.from('ebooks').remove([book.storage_path]);
        await supabaseClient.from('books').delete().eq('id', deleteBookId);
        closeDeleteModal();
        toast('Deleted!', 'success');
        loadBooks();
    } catch (error) {
        console.error('Delete error:', error);
        toast('Delete failed', 'error');
    }
});

// ============ EVENT LISTENERS ============
document.getElementById('uploadNavBtn').addEventListener('click', openUploadModal);
document.getElementById('adminBtn').addEventListener('click', openPasswordModal);
document.getElementById('unlockBtn').addEventListener('click', verifyPassword);
document.getElementById('passwordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            if (overlay.id === 'previewModal') closePreview();
            else if (overlay.id === 'uploadModal') closeUploadModal();
            else if (overlay.id === 'passwordModal') closePasswordModal();
            else if (overlay.id === 'deleteModal') closeDeleteModal();
        }
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// ============ HELPERS ============
function toast(message, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.className = 'toast ' + type + ' show';
    setTimeout(() => t.classList.remove('show'), 3000);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ START ============
isAdmin = false;