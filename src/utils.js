export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 text-white px-5 py-3 rounded-lg shadow-xl z-50 animate-toast text-base flex items-center gap-2 ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`;
    toast.innerHTML = `${type === 'success' ? '✔️' : type === 'error' ? '❌' : 'ℹ️'} ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
export function debounce(func, wait) { let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };