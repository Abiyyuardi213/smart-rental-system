
const sidebarHTML = `
<aside class="admin-sidebar">
    <div class="sidebar-brand">
        <i class="ph ph-steering-wheel" style="font-size:28px;"></i>
        <span>SmartRental</span>
    </div>
    
    <nav class="sidebar-menu">
        <a href="monitoring.html" class="sidebar-link" id="link-monitoring">
            <i class="ph ph-monitor" style="font-size:18px;"></i> Monitoring
        </a>
        <a href="armada.html" class="sidebar-link" id="link-armada">
            <i class="ph ph-car" style="font-size:18px;"></i> Armada Mobil
        </a>
        <a href="riwayat.html" class="sidebar-link" id="link-riwayat">
            <i class="ph ph-clock-counter-clockwise" style="font-size:18px;"></i> Riwayat
        </a>
        <a href="peminjaman.html" class="sidebar-link" id="link-peminjaman">
            <i class="ph ph-receipt" style="font-size:18px;"></i> Peminjaman
            <span id="badge-peminjaman" class="badge badge-warning" style="margin-left:auto; display:none; font-size:11px;">0</span>
        </a>
        <a href="pengguna.html" class="sidebar-link" id="link-pengguna">
            <i class="ph ph-users" style="font-size:18px;"></i> Pengguna
            <span id="badge-pengguna" class="badge badge-warning" style="margin-left:auto; display:none; font-size:11px;">0</span>
        </a>
    </nav>

    <div style="padding: 24px;">
        <button onclick="logout()" class="btn btn-destructive" style="width:100%; gap:8px;">
            <i class="ph ph-sign-out" style="font-size:18px;"></i> Keluar
        </button>
    </div>
</aside>
`;

function initAdminLayout(activePage) {
    // 1. Check Auth
    const token = localStorage.getItem('token');
    if (!token) window.location.href = '/';

    // 2. Inject Sidebar
    const container = document.getElementById('sidebar-container');
    if (container) {
        container.innerHTML = sidebarHTML;
        
        // Mobile Toggle Logic
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.onclick = () => document.querySelector('.admin-sidebar').classList.remove('show');
        document.body.appendChild(overlay);

        // Inject Menu Button into .admin-main
        const main = document.querySelector('.admin-main');
        if (main) {
            const menuBtn = document.createElement('button');
            menuBtn.className = 'mobile-menu-btn';
            menuBtn.innerHTML = '<i class="ph ph-list"></i>';
            menuBtn.onclick = () => {
                document.querySelector('.admin-sidebar').classList.add('show');
                overlay.classList.add('show');
            };
            
            // Insert before header or as first child
            main.insertBefore(menuBtn, main.firstChild);

            // Close Logic for Overlay
            overlay.onclick = () => {
                document.querySelector('.admin-sidebar').classList.remove('show');
                overlay.classList.remove('show');
            };
        }

        // Add Close Button to Sidebar Brand
        const brand = document.querySelector('.sidebar-brand');
        if (brand) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'sidebar-close-btn';
            closeBtn.innerHTML = '<i class="ph ph-x"></i>';
            closeBtn.onclick = () => {
                document.querySelector('.admin-sidebar').classList.remove('show');
                overlay.classList.remove('show');
            };
            brand.appendChild(closeBtn);
        }
    }

    // 3. Set Active State
    if (activePage) {
        const link = document.getElementById(`link-${activePage}`);
        if (link) link.classList.add('active');
    }

    // 4. Update Badges (Optional: periodic fetch)
    updateBadges();
}

function logout() {
    Swal.fire({
        title: 'Keluar?', text: "Anda akan mengakhiri sesi admin.", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#f4f4f5',
        confirmButtonText: 'Ya, Keluar', cancelButtonText: 'Batal',
        customClass: { popup: 'swal-popup-custom', cancelButton: 'swal-cancel-custom' }
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('token');
            
            Swal.fire({
                icon: 'success',
                title: 'Logout Berhasil',
                text: 'Sesi admin telah berakhir.',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                window.location.href = '/';
            });
        }
    });
}

async function updateBadges() {
    const token = localStorage.getItem('token');
    try {
        // Peminjaman
        const resRent = await fetch('/api/rentals/pending', { headers: { 'Authorization': 'Bearer ' + token } });
        const dataRent = await resRent.json();
        const badgeRent = document.getElementById('badge-peminjaman');
        if(badgeRent && dataRent.length > 0) {
            badgeRent.innerText = dataRent.length;
            badgeRent.style.display = 'inline-block';
        }

        // Pengguna
        const resUser = await fetch('/api/admin/users', { headers: { 'Authorization': 'Bearer ' + token } });
        const dataUser = await resUser.json();
        const pendingUser = dataUser.filter(u => u.status === 'PENDING').length;
        const badgeUser = document.getElementById('badge-pengguna');
        if(badgeUser && pendingUser > 0) {
            badgeUser.innerText = pendingUser;
            badgeUser.style.display = 'inline-block';
        }
    } catch(e) { console.error("Badge update failed", e); }
}
