/**
 * charts.js - Handles Chart.js initialization and updates
 * for Uthai Thani Technical College Executive Dashboard.
 */

(function (window) {
    'use strict';

    const appCharts = {
        statusChart: null,
        budgetChart: null,

        getThemeColors() {
            const isLight = document.documentElement.classList.contains('light');
            return {
                text: isLight ? '#475569' : '#94a3b8',
                grid: isLight ? '#e2e8f0' : '#334155',
                tooltipBg: isLight ? '#0f172a' : '#1e293b',
                tooltipText: '#ffffff'
            };
        },

        init() {
            const colors = this.getThemeColors();
            Chart.defaults.font.family = "'Inter', 'Sarabun', sans-serif";
            Chart.defaults.color = colors.text;

            // 1. Status Breakdown Chart (Doughnut)
            const statusCtx = document.getElementById('chart-status-breakdown');
            if (statusCtx) {
                this.statusChart = new Chart(statusCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['ดำเนินการแล้ว', 'อยู่ระหว่างดำเนินการ', 'ยังไม่ดำเนินการ'],
                        datasets: [{
                            data: [0, 0, 0],
                            backgroundColor: [
                                '#10b981', // Emerald 500 (Success)
                                '#f59e0b', // Amber 500 (Warning)
                                '#64748b'  // Slate 500 (Not Started / Muted)
                            ],
                            borderWidth: 2,
                            borderColor: document.documentElement.classList.contains('light') ? '#ffffff' : '#1e293b'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    boxWidth: 12,
                                    padding: 15,
                                    color: colors.text
                                }
                            },
                            tooltip: {
                                backgroundColor: colors.tooltipBg,
                                titleColor: colors.tooltipText,
                                bodyColor: colors.tooltipText,
                                padding: 10,
                                cornerRadius: 6
                            }
                        },
                        cutout: '70%'
                    }
                });
            }

            // 2. Budget Comparison Chart (Bar Chart)
            const budgetCtx = document.getElementById('chart-budget-comparison');
            if (budgetCtx) {
                this.budgetChart = new Chart(budgetCtx, {
                    type: 'bar',
                    data: {
                        labels: [],
                        datasets: [
                            {
                                label: 'งบประมาณโครงการ (บาท)',
                                backgroundColor: '#b91c1c', // Crimson
                                data: [],
                                borderRadius: 4,
                                maxBarThickness: 32
                            },
                            {
                                label: 'ใช้จ่ายแล้ว (บาท)',
                                backgroundColor: '#06b6d4', // Cyan
                                data: [],
                                borderRadius: 4,
                                maxBarThickness: 32
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: {
                                    boxWidth: 12,
                                    color: colors.text
                                }
                            },
                            tooltip: {
                                backgroundColor: colors.tooltipBg,
                                titleColor: colors.tooltipText,
                                bodyColor: colors.tooltipText,
                                padding: 10,
                                cornerRadius: 6,
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        if (label) {
                                            label += ': ';
                                        }
                                        if (context.raw !== null) {
                                            label += new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(context.raw);
                                        }
                                        return label;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: {
                                    color: colors.grid
                                },
                                ticks: {
                                    color: colors.text
                                }
                            },
                            y: {
                                grid: {
                                    color: colors.grid
                                },
                                ticks: {
                                    color: colors.text,
                                    callback: function(value) {
                                        if (value >= 1e6) {
                                            return (value / 1e6) + 'M ฿';
                                        } else if (value >= 1e3) {
                                            return (value / 1e3) + 'k ฿';
                                        }
                                        return value + ' ฿';
                                    }
                                }
                            }
                        }
                    }
                });
            }
        },

        update(projects) {
            const colors = this.getThemeColors();

            // Status counters
            let completed = 0;
            let inProgress = 0;
            let notStarted = 0;

            projects.forEach(p => {
                if (p.status === 'ดำเนินการแล้ว') {
                    completed++;
                } else if (p.status === 'อยู่ระหว่างดำเนินการ') {
                    inProgress++;
                } else {
                    notStarted++;
                }
            });

            if (this.statusChart) {
                this.statusChart.data.datasets[0].data = [completed, inProgress, notStarted];
                this.statusChart.data.datasets[0].borderColor = document.documentElement.classList.contains('light') ? '#ffffff' : '#1e293b';
                this.statusChart.options.plugins.legend.labels.color = colors.text;
                this.statusChart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
                this.statusChart.update();
            }

            // Budget chart
            if (this.budgetChart) {
                const labels = projects.map(p => p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name);
                const budgets = projects.map(p => p.budget);
                const spent = projects.map(p => p.spent);

                this.budgetChart.data.labels = labels;
                this.budgetChart.data.datasets[0].data = budgets;
                this.budgetChart.data.datasets[1].data = spent;

                this.budgetChart.options.plugins.legend.labels.color = colors.text;
                this.budgetChart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
                this.budgetChart.options.scales.x.grid.color = colors.grid;
                this.budgetChart.options.scales.x.ticks.color = colors.text;
                this.budgetChart.options.scales.y.grid.color = colors.grid;
                this.budgetChart.options.scales.y.ticks.color = colors.text;
                
                this.budgetChart.update();
            }
        },

        applyThemeChange() {
            const colors = this.getThemeColors();
            Chart.defaults.color = colors.text;

            if (this.statusChart) {
                this.statusChart.data.datasets[0].borderColor = document.documentElement.classList.contains('light') ? '#ffffff' : '#1e293b';
                this.statusChart.options.plugins.legend.labels.color = colors.text;
                this.statusChart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
                this.statusChart.update();
            }

            if (this.budgetChart) {
                this.budgetChart.options.plugins.legend.labels.color = colors.text;
                this.budgetChart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
                this.budgetChart.options.scales.x.grid.color = colors.grid;
                this.budgetChart.options.scales.x.ticks.color = colors.text;
                this.budgetChart.options.scales.y.grid.color = colors.grid;
                this.budgetChart.options.scales.y.ticks.color = colors.text;
                this.budgetChart.update();
            }
        }
    };

    window.appCharts = appCharts;

})(window);
