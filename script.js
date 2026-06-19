// ============ SUPABASE ============
const SUPABASE_URL = 'https://nycbxdeikgcmwjdddhjb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55Y2J4ZGVpa2djbXdqZGRkaGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDc2NTcsImV4cCI6MjA5Njc4MzY1N30.PZ25VzaCP79OGxJJw1y5xQHN0S58WZOUaNms0ZVpPx4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const UPLOAD_PASSWORD = '280806';

// ============ STATE ============
let isAdmin = false;
let books = [];
let selectedFile = null;
let deleteBookId = null;
let currentFilter = 'all';

// ============ INIT ============
loadBooks();

async function loadBooks() {
    const { data, error } = await supabaseClient.from('books').select('*').order('created_at', { ascending: false });
    if (!error) { books = data || []; }
    renderBooks();
    updateStats();
}

function updateStats() {
    document.getElementById('totalBooks').textContent = books.length;
    document.getElementById('totalDownloads').textContent = books.reduce((s, b) => s + (b.downloads || 0), 0);
}

// ============ RENDER ============
function renderBooks() {
    const grid = document.getElementById('bookGrid');
    const empty = document.getElementById('emptyState');
    let filtered = books;
    if (currentFilter !== 'all') filtered = books.filter(b => b.name.toLowerCase().endsWith('.' + currentFilter));
    
    if (filtered.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; }
    else {
        empty.style.display = 'none';
        grid.innerHTML = filtered.map(book => {
            const ext = book.name.split('.').pop().toLowerCase();
            const icons = { pdf: '📕', epub: '📗', mobi: '📘' };
            return `<div class="book-card">
                <div class="book-icon">${icons[ext] || '📙'}</div>
                <div class="book-title" onclick="openPreview('${book.id}')">${book.name}</div>
                <div class="book-meta-row"><span class="book-meta-item">📦 ${book.size}</span><span class="book-meta-item">⬇️ ${book.downloads||0}</span></div>
                <div class="book-card-actions">
                    <button class="btn btn-outline btn-sm" onclick="openPreview('${book.id}')">👁️</button>
                    <button class="btn btn-primary btn-sm" onclick="downloadBook('${book.id}')">⬇️</button>
                    ${isAdmin?`<button class="btn btn-danger btn-sm" onclick="openDeleteModal('${book.id}')">🗑️</button>`:''}
                </div></div>`;
        }).join('');
    }
}

// ============ SEARCH & FILTER ============
function searchBooks() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.book-card').forEach(card => {
        const title = card.querySelector('.book-title').textContent.toLowerCase();
        card.style.display = title.includes(q) ? '' : 'none';
    });
}

function filterBooks(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    renderBooks();
}

// ============ PREVIEW ============
async function openPreview(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    document.getElementById('previewTitle').textContent = book.name;
    document.getElementById('previewMeta').textContent = `📦 ${book.size} • ⬇️ ${book.downloads||0}`;
    document.getElementById('previewContainer').innerHTML = '<div class="preview-loading"><div class="spinner"></div><p>Loading...</p></div>';
    document.getElementById('previewModal').classList.add('active');
    document.getElementById('previewDownloadBtn').onclick = () => { downloadBook(book.id); closePreview(); };
    
    try {
        const { data } = await supabaseClient.storage.from('ebooks').download(book.storage_path);
        const ext = book.name.split('.').pop().toLowerCase();
        const url = URL.createObjectURL(data);
        document.getElementById('previewContainer').innerHTML = ext === 'pdf' ? `<iframe src="${url}"></iframe>` : `<div style="text-align:center;padding:60px;"><div style="font-size:80px;">📖</div><h3>${book.name}</h3><p style="color:#8a8a8a;">Preview not available</p></div>`;
    } catch(e) {
        document.getElementById('previewContainer').innerHTML = '<p style="text-align:center;padding:60px;color:#8a8a8a;">Unable to load preview.</p>';
    }
}

function closePreview() { document.getElementById('previewModal').classList.remove('active'); }

// ============ DOWNLOAD ============
async function downloadBook(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    await supabaseClient.from('books').update({ downloads: (book.downloads||0)+1 }).eq('id', bookId);
    const { data } = await supabaseClient.storage.from('ebooks').download(book.storage_path);
    if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a'); a.href = url; a.download = book.name; a.click();
        URL.revokeObjectURL(url);
        toast('Downloaded!');
        loadBooks();
    }
}

// ============ UPLOAD ============
function handleAdminClick() {
    if (isAdmin) { openUploadModal(); }
    else { openPasswordModal(); }
}

function handleUploadClick() { openUploadModal(); }

function openUploadModal() {
    if (!isAdmin) { openPasswordModal(); return; }
    document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() { document.getElementById('uploadModal').classList.remove('active'); }

function handleFileSelect(file) {
    if (!file) return;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!['.pdf','.epub','.mobi'].includes(ext)) { alert('Invalid file type'); return; }
    if (file.size > 100*1024*1024) { alert('File too large'); return; }
    selectedFile = file;
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileSize').textContent = (file.size/1024/1024).toFixed(1)+' MB';
    document.getElementById('fileInfo').style.display = 'flex';
    document.getElementById('uploadBtn').disabled = false;
}

async function uploadBook() {
    if (!selectedFile || !isAdmin) return;
    const btn = document.getElementById('uploadBtn'); btn.disabled = true;
    const bar = document.getElementById('progressBar'); bar.style.display = 'block';
    const prog = document.getElementById('progress'); prog.style.width = '0%';
    
    const id = Date.now()+'_'+Math.random().toString(36).substr(2,9);
    const path = id+'_'+selectedFile.name;
    
    let int = setInterval(() => { let w = parseFloat(prog.style.width)||0; if(w<85) prog.style.width = (w+Math.random()*10)+'%'; }, 300);
    
    const { error: upErr } = await supabaseClient.storage.from('ebooks').upload(path, selectedFile);
    clearInterval(int);
    if (upErr) { alert('Upload failed: '+upErr.message); btn.disabled=false; bar.style.display='none'; return; }
    
    prog.style.width = '100%';
    await supabaseClient.from('books').insert([{ id, name: selectedFile.name, size: (selectedFile.size/1024/1024).toFixed(1)+' MB', storage_path: path, downloads: 0 }]);
    
    setTimeout(() => { bar.style.display='none'; btn.disabled=false; closeUploadModal(); toast('Uploaded!'); loadBooks(); }, 500);
}

// ============ PASSWORD ============
function openPasswordModal() {
    document.getElementById('passwordModal').classList.add('active');
    document.getElementById('passwordError').style.display = 'none';
    document.getElementById('passwordInput').value = '';
    setTimeout(() => document.getElementById('passwordInput').focus(), 100);
}

function closePasswordModal() { document.getElementById('passwordModal').classList.remove('active'); }

function verifyPassword() {
    if (document.getElementById('passwordInput').value === UPLOAD_PASSWORD) {
        isAdmin = true;
        closePasswordModal();
        document.getElementById('uploadNavBtn').style.display = 'inline-flex';
        document.getElementById('adminBtn').textContent = '✅ Admin';
        renderBooks();
        toast('Admin granted!');
    } else {
        document.getElementById('passwordError').style.display = 'block';
        document.getElementById('passwordInput').value = '';
    }
}

// ============ DELETE ============
function openDeleteModal(bookId) {
    if (!isAdmin) return;
    deleteBookId = bookId;
    document.getElementById('deleteBookName').textContent = books.find(b=>b.id===bookId)?.name;
    document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() { document.getElementById('deleteModal').classList.remove('active'); }

async function confirmDelete() {
    if (!deleteBookId) return;
    const book = books.find(b=>b.id===deleteBookId);
    await supabaseClient.storage.from('ebooks').remove([book.storage_path]);
    await supabaseClient.from('books').delete().eq('id', deleteBookId);
    closeDeleteModal(); toast('Deleted!'); loadBooks();
}

// ============ MODAL CLOSE ============
document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', (e) => { if(e.target===o) o.classList.remove('active'); });
});

// ============ TOAST ============
function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast success show';
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ============ START ============
isAdmin = false;