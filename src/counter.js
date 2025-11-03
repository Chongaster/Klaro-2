// --- Version 5.3 (Modales superposées) ---
// (Ce fichier est stable et n'est pas utilisé par l'application principale)

export function setupCounter(element) {
  let counter = 0
  const setCounter = (count) => {
    counter = count
    element.innerHTML = `count is ${counter}`
  }
  element.addEventListener('click', () => setCounter(counter + 1))
  setCounter(0)
}

