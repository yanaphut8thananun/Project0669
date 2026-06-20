/**
 * app.js - Live Google Sheets integration for Uthai Thani Technical College Executive Dashboard.
 * Fetches, parses, and summarizes project data from Google Sheet.
 */

(function (window, appCharts) {
    'use strict';

    // Global callback definition for Google Visualization API JSONP response (bypasses CORS)
    window.google = {
        visualization: {
            Query: {
                setResponse: function(data) {
                    if (window.app && typeof window.app.handleJSONPResponse === 'function') {
                        window.app.handleJSONPResponse(data);
                    }
                }
            }
        }
    };

    const SPREADSHEET_JSON_URL = 'https://docs.google.com/spreadsheets/d/1HavaRP_aBeWX3hrfTGa2R6ky31N5-yGkUhgSzEfcpfQ/gviz/tq';
    const LS_KEY_STATE = 'ut_dashboard_state';
    const LS_KEY_THEME = 'ut_dashboard_theme';
    const LS_KEY_LAST_SYNC = 'ut_dashboard_last_sync';

    // Application state
    const state = {
        projects: [],
        currentView: 'dashboard',
        selectedProjectId: null,
        theme: 'dark',
        lastSyncTime: null
    };

    const app = {
        init() {
            this.setupTheme();
            this.setupEventHandlers();
            
            if (appCharts) {
                appCharts.init();
            }

            this.switchView('dashboard');
            
            // Initial Sync from Google Sheet on Page Load
            this.syncData(true);
        },

        setupTheme() {
            const savedTheme = localStorage.getItem(LS_KEY_THEME) || 'dark';
            state.theme = savedTheme;
            const html = document.documentElement;
            if (state.theme === 'light') {
                html.classList.remove('dark');
                html.classList.add('light');
            } else {
                html.classList.remove('light');
                html.classList.add('dark');
            }
        },

        toggleTheme() {
            const html = document.documentElement;
            if (html.classList.contains('dark')) {
                html.classList.remove('dark');
                html.classList.add('light');
                state.theme = 'light';
            } else {
                html.classList.remove('light');
                html.classList.add('dark');
                state.theme = 'dark';
            }
            localStorage.setItem(LS_KEY_THEME, state.theme);
            if (appCharts) {
                appCharts.applyThemeChange();
            }
            this.showToast('สลับชุดสีธีมเรียบร้อยแล้ว', 'info');
        },

        switchView(viewName) {
            state.currentView = viewName;
            
            document.querySelectorAll('.menu-item').forEach(item => {
                if (item.getAttribute('data-view') === viewName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            document.querySelectorAll('.view-pane').forEach(pane => {
                if (pane.id === `view-${viewName}`) {
                    pane.classList.add('active');
                } else {
                    pane.classList.remove('active');
                }
            });

            const titleMap = {
                'dashboard': 'รายงานสรุปภาพรวมแผนงานและงบประมาณสำหรับผู้บริหาร',
                'plans': 'ตารางวิเคราะห์และติดตามสถานะความคืบหน้าโครงการ',
                'settings': 'การจัดการลิงก์ข้อมูลและการนำไปเผยแพร่ต่อ'
            };
            document.getElementById('page-title').textContent = titleMap[viewName] || 'Executive Dashboard';

            // Close mobile sidebar if open
            document.getElementById('app-sidebar').classList.remove('show');

            this.renderAll();
        },

        renderAll() {
            if (state.projects.length === 0) return;

            if (state.currentView === 'dashboard') {
                this.renderDashboard();
            } else if (state.currentView === 'plans') {
                this.renderProjectsList();
            }
        },

        // FETCH AND PARSE GOOGLE SHEET DATA VIA GVIZ JSONP (Bypasses CORS on file://)
        syncData(silent = false) {
            const syncDot = document.getElementById('sync-status-dot');
            const syncTimeText = document.getElementById('sync-last-time');
            const syncBtn = document.getElementById('btn-sync-now');

            if (syncDot) {
                syncDot.className = 'sync-dot loading';
            }
            if (syncTimeText) {
                syncTimeText.textContent = 'กำลังดึงข้อมูล...';
            }
            if (syncBtn) {
                syncBtn.disabled = true;
            }

            // Set up timeout for fallback if loading takes too long (e.g. offline)
            const timeoutId = setTimeout(() => {
                this.handleSyncError(new Error('การเชื่อมต่อหมดเวลา (Timeout)'), silent);
                this.cleanupScript();
            }, 6000);

            // Save state indicators
            state.activeTimeoutId = timeoutId;
            state.isSilentSync = silent;

            // Remove existing script if any
            this.cleanupScript();

            // Create new script tag to fetch data using JSONP
            const script = document.createElement('script');
            script.src = `${SPREADSHEET_JSON_URL}?tqx=responseHandler:google.visualization.Query.setResponse&t=${Date.now()}`;
            script.id = 'gviz-jsonp-script';
            script.onerror = () => {
                clearTimeout(timeoutId);
                this.handleSyncError(new Error('ไม่สามารถโหลดข้อมูลจาก Google Sheet ได้ (Script Error)'), silent);
                this.cleanupScript();
            };

            document.body.appendChild(script);
        },

        cleanupScript() {
            const existingScript = document.getElementById('gviz-jsonp-script');
            if (existingScript) {
                existingScript.remove();
            }
        },

        handleJSONPResponse(data) {
            // Clear the timeout
            if (state.activeTimeoutId) {
                clearTimeout(state.activeTimeoutId);
                state.activeTimeoutId = null;
            }

            const syncDot = document.getElementById('sync-status-dot');
            const syncTimeText = document.getElementById('sync-last-time');
            const syncBtn = document.getElementById('btn-sync-now');

            try {
                if (!data || data.status !== 'ok' || !data.table) {
                    throw new Error('Google Sheets API returned error or status is not ok');
                }

                // Extract headers from cols
                const headers = data.table.cols.map(col => col.label ? col.label.trim() : '');
                
                // Extract rows and map to objects
                const parsedRows = data.table.rows.map(row => {
                    let obj = {};
                    headers.forEach((header, idx) => {
                        if (header) {
                            const cell = row.c && row.c[idx];
                            obj[header] = cell && cell.v !== null && cell.v !== undefined ? cell.v : '';
                        }
                    });
                    return obj;
                });
                
                if (parsedRows.length === 0) {
                    throw new Error('No rows found in sheet');
                }

                // Map raw fields into our standardized fields
                state.projects = parsedRows.map(item => {
                    const budget = Number(item['งบประมาณ'] || 0);
                    const spent = Number(item['ใช้ไปแล้ว'] || 0);
                    const progress = Number(item['ความคืบหน้า'] || 0);
                    return {
                        id: String(item['รหัสโครงการ'] || ''),
                        name: String(item['ชื่อโครงการ'] || 'ไม่มีชื่อโครงการ'),
                        owner: String(item['ผู้รับผิดชอบ'] || 'ไม่ระบุ'),
                        category: String(item['กลุ่มงาน'] || 'วิชาการ'),
                        budget: budget,
                        spent: spent,
                        remaining: budget - spent,
                        progress: progress,
                        status: String(item['สถานะ'] || 'ยังไม่ดำเนินการ')
                    };
                }).filter(p => p.id);

                state.lastSyncTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                
                // Cache locally
                localStorage.setItem(LS_KEY_STATE, JSON.stringify(state.projects));
                localStorage.setItem(LS_KEY_LAST_SYNC, state.lastSyncTime);

                if (syncDot) syncDot.className = 'sync-dot blinking';
                if (syncTimeText) syncTimeText.textContent = `อัปเดตล่าสุด: ${state.lastSyncTime}`;
                
                this.populateCategoryFilter();
                this.renderAll();
                
                if (!state.isSilentSync) {
                    this.showToast('ดึงข้อมูลล่าสุดจาก Google Sheet สำเร็จแล้ว', 'success');
                }
            } catch (error) {
                this.handleSyncError(error, state.isSilentSync);
            } finally {
                this.cleanupScript();
                if (syncBtn) {
                    syncBtn.disabled = false;
                }
            }
        },

        handleSyncError(error, silent) {
            console.error('Sync error:', error);
            
            const syncDot = document.getElementById('sync-status-dot');
            const syncTimeText = document.getElementById('sync-last-time');
            const syncBtn = document.getElementById('btn-sync-now');

            // Load from cache on failure
            const cachedData = localStorage.getItem(LS_KEY_STATE);
            const cachedSyncTime = localStorage.getItem(LS_KEY_LAST_SYNC);
            
            if (cachedData) {
                state.projects = JSON.parse(cachedData);
                state.lastSyncTime = cachedSyncTime;
                
                if (syncDot) syncDot.className = 'sync-dot error';
                if (syncTimeText) syncTimeText.textContent = `ออฟไลน์ (ล่าสุด: ${state.lastSyncTime || 'ไม่ระบุ'})`;
                
                this.populateCategoryFilter();
                this.renderAll();
                if (!silent) {
                    this.showToast('ไม่สามารถเชื่อมต่อได้ แสดงข้อมูลสำรองจากการเปิดครั้งล่าสุด', 'warning');
                }
            } else {
                if (syncDot) syncDot.className = 'sync-dot error';
                if (syncTimeText) syncTimeText.textContent = 'การเชื่อมต่อผิดพลาด';
                if (!silent) {
                    this.showToast('ไม่สามารถดึงข้อมูลและไม่มีข้อมูลสำรองในเบราว์เซอร์', 'danger');
                }
            }

            if (syncBtn) {
                syncBtn.disabled = false;
            }
        },


        // Render drop-down option lists for filtering
        populateCategoryFilter() {
            const filterCat = document.getElementById('filter-category');
            if (!filterCat) return;

            // Extract unique categories dynamically from spreadsheet rows
            const uniqueCategories = [...new Set(state.projects.map(p => p.category))].filter(Boolean);
            
            // Keep current value if any
            const curVal = filterCat.value;
            filterCat.innerHTML = '<option value="">ทุกกลุ่มงาน</option>';
            
            uniqueCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                filterCat.appendChild(opt);
            });

            if (uniqueCategories.includes(curVal)) {
                filterCat.value = curVal;
            }
        },

        // RENDER: DASHBOARD VIEW
        renderDashboard() {
            const total = state.projects.length;
            const completed = state.projects.filter(p => p.status === 'ดำเนินการแล้ว').length;
            const inProgress = state.projects.filter(p => p.status === 'อยู่ระหว่างดำเนินการ').length;
            const notStarted = state.projects.filter(p => p.status === 'ยังไม่ดำเนินการ').length;

            const completedPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
            const inProgressPercent = total > 0 ? Math.round((inProgress / total) * 100) : 0;
            const notStartedPercent = total > 0 ? Math.round((notStarted / total) * 100) : 0;

            let totalBudget = 0;
            let totalSpent = 0;
            state.projects.forEach(p => {
                totalBudget += p.budget;
                totalSpent += p.spent;
            });

            // Update stats cards
            document.getElementById('stat-total-plans').textContent = total;
            document.getElementById('stat-completed-plans').textContent = completed;
            document.getElementById('stat-completed-percent').textContent = `${completedPercent}% ของทั้งหมด`;
            document.getElementById('stat-inprogress-plans').textContent = inProgress;
            document.getElementById('stat-inprogress-percent').textContent = `${inProgressPercent}% ของทั้งหมด`;
            document.getElementById('stat-risk-plans').textContent = notStarted;
            document.getElementById('stat-risk-percent').textContent = `${notStartedPercent}% ของทั้งหมด`;

            const formatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
            document.getElementById('stat-total-budget').textContent = formatter.format(totalBudget);
            document.getElementById('stat-spent-budget').textContent = `เบิกจ่ายแล้ว ${formatter.format(totalSpent)} (${totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0}%)`;

            // Render category progress lists
            const categories = [...new Set(state.projects.map(p => p.category))].filter(Boolean);
            const categoryContainer = document.getElementById('category-progress-container');
            if (categoryContainer) {
                categoryContainer.innerHTML = '';
                if (categories.length === 0) {
                    categoryContainer.innerHTML = '<p class="text-secondary font-sm">ไม่มีข้อมูลกลุ่มงาน</p>';
                } else {
                    categories.forEach(cat => {
                        const catProjects = state.projects.filter(p => p.category === cat);
                        let sumProgress = 0;
                        catProjects.forEach(p => sumProgress += p.progress);
                        const avgProgress = catProjects.length > 0 ? Math.round((sumProgress / catProjects.length) * 100) / 100 : 0;

                        const catHtml = `
                            <div class="category-progress-item">
                                <div class="category-header">
                                    <span class="category-label">${cat} (${catProjects.length} โครงการ)</span>
                                    <span class="category-val">${avgProgress}%</span>
                                </div>
                                <div class="progress-bar-container">
                                    <div class="progress-bar" style="width: ${avgProgress}%;"></div>
                                </div>
                            </div>
                        `;
                        categoryContainer.insertAdjacentHTML('beforeend', catHtml);
                    });
                }
            }

            // Render Top Projects table (by progress rate)
            const topTbody = document.getElementById('top-projects-tbody');
            const activeCount = document.getElementById('projects-active-count');
            if (topTbody) {
                topTbody.innerHTML = '';
                
                // Sort by progress descending, then take top 5
                const sortedProjects = [...state.projects].sort((a, b) => b.progress - a.progress).slice(0, 5);
                activeCount.textContent = `${total} โครงการ`;

                sortedProjects.forEach(p => {
                    let badge = '';
                    if (p.status === 'ดำเนินการแล้ว') {
                        badge = '<span class="badge badge-success">เสร็จสิ้น</span>';
                    } else if (p.status === 'อยู่ระหว่างดำเนินการ') {
                        badge = '<span class="badge badge-warning">ดำเนินการอยู่</span>';
                    } else {
                        badge = '<span class="badge text-secondary border">ยังไม่ดำเนินการ</span>';
                    }

                    const row = `
                        <tr>
                            <td><strong class="clickable" onclick="app.openProjectDetails('${p.id}')" style="cursor: pointer; color: var(--color-text-main);">${p.name}</strong></td>
                            <td>${p.owner}</td>
                            <td><span class="text-secondary">${p.category}</span></td>
                            <td>
                                <div class="flex-between margin-bottom-xs" style="font-size: 0.75rem;">
                                    <span>${p.progress}%</span>
                                </div>
                                <div class="progress-bar-container" style="height: 6px;">
                                    <div class="progress-bar" style="width: ${p.progress}%;"></div>
                                </div>
                            </td>
                            <td>${badge}</td>
                        </tr>
                    `;
                    topTbody.insertAdjacentHTML('beforeend', row);
                });
            }

            // Trigger Chart Updates
            if (appCharts) {
                appCharts.update(state.projects);
            }
        },

        // RENDER: PROJECTS LIST TABLE VIEW
        renderProjectsList() {
            const tbody = document.getElementById('plans-table-tbody');
            if (!tbody) return;

            const searchQuery = document.getElementById('filter-search').value.toLowerCase();
            const catFilter = document.getElementById('filter-category').value;
            const statusFilter = document.getElementById('filter-status').value;

            const filtered = state.projects.filter(p => {
                const matchSearch = p.name.toLowerCase().includes(searchQuery) || p.owner.toLowerCase().includes(searchQuery);
                const matchCat = catFilter ? p.category === catFilter : true;
                const matchStatus = statusFilter ? p.status === statusFilter : true;
                return matchSearch && matchCat && matchStatus;
            });

            tbody.innerHTML = '';

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-secondary text-center" style="text-align: center; padding: 30px;">ไม่พบข้อมูลโครงการที่ค้นหา</td></tr>';
                return;
            }

            const formatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

            filtered.forEach(p => {
                let badge = '';
                if (p.status === 'ดำเนินการแล้ว') {
                    badge = '<span class="badge badge-success">ดำเนินการแล้ว</span>';
                } else if (p.status === 'อยู่ระหว่างดำเนินการ') {
                    badge = '<span class="badge badge-warning">อยู่ระหว่างดำเนินการ</span>';
                } else {
                    badge = '<span class="badge text-secondary border">ยังไม่ดำเนินการ</span>';
                }

                const row = `
                    <tr>
                        <td><strong>${p.id}</strong></td>
                        <td><strong class="clickable" onclick="app.openProjectDetails('${p.id}')" style="cursor: pointer; color: var(--color-text-main);">${p.name}</strong></td>
                        <td><span class="text-secondary">${p.category}</span></td>
                        <td>${p.owner}</td>
                        <td style="text-align: right;" class="text-info">${formatter.format(p.budget)}</td>
                        <td style="text-align: right;" class="text-success">${formatter.format(p.spent)}</td>
                        <td style="text-align: right;" class="${p.remaining < 0 ? 'text-danger' : 'text-secondary'}">${formatter.format(p.remaining)}</td>
                        <td>
                            <div class="flex-between margin-bottom-xs" style="font-size: 0.75rem;">
                                <span class="text-primary font-semibold">${p.progress}%</span>
                            </div>
                            <div class="progress-bar-container" style="height: 6px;">
                                <div class="progress-bar" style="width: ${p.progress}%;"></div>
                            </div>
                        </td>
                        <td>${badge}</td>
                        <td style="text-align: center;">
                            <button class="btn btn-secondary btn-sm" onclick="app.openProjectDetails('${p.id}')">ดูรายละเอียด</button>
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', row);
            });
        },

        // PROJECT DETAILS MODAL
        openProjectDetails(projectId) {
            const p = state.projects.find(proj => proj.id === projectId);
            if (!p) return;

            document.getElementById('details-plan-name').textContent = p.name;
            
            // Adjust category badge color
            const catBadge = document.getElementById('details-plan-category');
            catBadge.className = 'badge';
            catBadge.textContent = p.category;
            const catColors = {
                'วิชาการ': 'badge-primary',
                'วิทยาศาสตร์และเทคโนโลยี': 'badge-warning',
                'สังคมศึกษา': 'badge-success',
                'งบประมาณและสินทรัพย์': 'badge-danger'
            };
            catBadge.classList.add(catColors[p.category] || 'badge-info');

            document.getElementById('details-plan-id').textContent = p.id;
            document.getElementById('details-plan-owner').textContent = p.owner;
            document.getElementById('details-plan-category-text').textContent = p.category;
            document.getElementById('details-plan-status').textContent = p.status;

            const formatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
            document.getElementById('details-plan-budget').textContent = formatter.format(p.budget);
            document.getElementById('details-plan-spent').textContent = formatter.format(p.spent);
            
            const remainingEl = document.getElementById('details-plan-remaining');
            remainingEl.textContent = formatter.format(p.remaining);
            if (p.remaining < 0) {
                remainingEl.className = 'info-value text-danger';
            } else {
                remainingEl.className = 'info-value text-success';
            }

            document.getElementById('details-plan-progress-text').textContent = `${p.progress}%`;
            document.getElementById('details-plan-progress-bar').style.width = `${p.progress}%`;

            document.getElementById('modal-plan-details').classList.add('show');
        },

        closeProjectDetails() {
            document.getElementById('modal-plan-details').classList.remove('show');
        },

        // EVENT SETUP
        setupEventHandlers() {
            // Sidebar menu switches
            document.querySelectorAll('.menu-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = item.getAttribute('data-view');
                    this.switchView(view);
                });
            });

            // Mobile sidebar toggles
            document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
                document.getElementById('app-sidebar').classList.add('show');
            });
            document.addEventListener('click', (e) => {
                const sidebar = document.getElementById('app-sidebar');
                const toggle = document.getElementById('btn-sidebar-toggle');
                if (window.innerWidth <= 768 && 
                    sidebar.classList.contains('show') && 
                    !sidebar.contains(e.target) && 
                    !toggle.contains(e.target)) {
                    sidebar.classList.remove('show');
                }
            });

            // Theme toggle
            document.getElementById('btn-theme-toggle').addEventListener('click', () => {
                this.toggleTheme();
            });

            // Sync Button
            document.getElementById('btn-sync-now').addEventListener('click', () => {
                this.syncData(false);
            });

            // Search and filtering triggers
            document.getElementById('filter-search').addEventListener('input', () => this.renderProjectsList());
            document.getElementById('filter-category').addEventListener('change', () => this.renderProjectsList());
            document.getElementById('filter-status').addEventListener('change', () => this.renderProjectsList());
            document.getElementById('btn-clear-filters').addEventListener('click', () => {
                document.getElementById('filter-search').value = '';
                document.getElementById('filter-category').value = '';
                document.getElementById('filter-status').value = '';
                this.renderProjectsList();
                this.showToast('ล้างค่าการกรองทั้งหมดแล้ว', 'info');
            });

            // Detail Modal closures
            document.getElementById('btn-close-details-modal').addEventListener('click', () => this.closeProjectDetails());
            document.getElementById('btn-close-details-footer').addEventListener('click', () => this.closeProjectDetails());
        },

        // TOAST NOTIFICATIONS MANAGER
        showToast(message, type = 'primary') {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            
            let iconSvg = '';
            switch (type) {
                case 'success':
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
                    break;
                case 'warning':
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
                    break;
                case 'danger':
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
                    break;
                default:
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
            }

            toast.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${iconSvg}
                    <span class="toast-message">${message}</span>
                </div>
                <button class="toast-close">&times;</button>
            `;

            container.appendChild(toast);

            toast.querySelector('.toast-close').addEventListener('click', () => {
                toast.remove();
            });

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.style.animation = 'slideIn 0.3s ease reverse forwards';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 4000);
        }
    };

    window.app = app;

    document.addEventListener('DOMContentLoaded', () => {
        app.init();
    });

})(window, window.appCharts);
