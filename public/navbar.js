function renderNavbar(activePage) {
    const container = document.getElementById('navbar-container');
    if (!container) return;

    const isHome = activePage === 'home' ? 'active' : '';
    const isProfile = activePage === 'profile' ? 'active' : '';

    const html = `
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <div class="user-info">
                    <div class="user-avatar">
                        <i class="ph ph-user"></i>
                    </div>
                    <div>
                         <h2 style="font-size: 16px; font-weight: 600; margin: 0;">Dashboard</h2>
                         <p style="font-size: 13px; color: var(--muted-foreground); margin: 0;" id="header-user-name">Memuat...</p>
                    </div>
                </div>

                <!-- Desktop Navigation -->
                <nav class="desktop-nav">
                    <a href="peminjam.html" class="nav-link ${isHome}">Beranda</a>
                    <a href="profile.html" class="nav-link ${isProfile}">Profil</a>
                </nav>
            </div>
            
            <button onclick="logout()" class="logout-btn">
                <i class="ph ph-sign-out" style="font-size: 18px;"></i>
                <span class="logout-text">Keluar</span>
            </button>
        </header>

        <!-- Bottom Navigation (Mobile Only) -->
        <nav class="bottom-nav">
            <a href="peminjam.html" class="nav-item ${isHome}">
                <i class="ph ph-house" style="font-size:20px;"></i>
                <span style="font-size:11px;">Beranda</span>
            </a>
            <a href="profile.html" class="nav-item ${isProfile}">
                <i class="ph ph-user" style="font-size:20px;"></i>
                <span style="font-size:11px;">Profil</span>
            </a>
        </nav>
    `;

    container.innerHTML = html;
}

function logout() {
    Swal.fire({
        title: 'Keluar?',
        text: "Anda akan mengakhiri sesi ini.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#f4f4f5',
        confirmButtonText: 'Ya, Keluar',
        cancelButtonText: 'Batal',
        customClass: {
            popup: 'swal-popup-custom',
            cancelButton: 'swal-cancel-custom'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('token');
            localStorage.removeItem('accountStatus');
            
            Swal.fire({
                icon: 'success',
                title: 'Berhasil Keluar',
                text: 'Sampai jumpa lagi!',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                window.location.href = '/';
            });
        }
    });
}

function updateHeaderUser(name) {
    const el = document.getElementById('header-user-name');
    if(el) el.innerText = name;
}
