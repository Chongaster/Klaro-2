// --- Version 5.20 (Stable + Voyage) ---
// Note : ce fichier (v5.19) est stable.
// Fichier d'exemple, non utilisé par l'application Klaro.

export function setupCounter(element) {
  let counter = 0
  const setCounter = (count) => {
    counter = count
    element.innerHTML = `count is ${counter}`
  }
  element.addEventListener('click', () => setCounter(counter + 1))
  setCounter(0)
}