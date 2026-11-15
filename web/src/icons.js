const paths = {
  heart: '<path d="M20.8 5.7a5 5 0 0 0-7.1 0L12 7.4l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.2a5 5 0 0 0 0-7.1Z"/>',
  comment: '<path d="M21 11.5a8.7 8.7 0 0 1-9 8.4 9.2 9.2 0 0 1-3.4-.6L4 21l1.3-4a8 8 0 0 1-2.3-5.5 8.7 8.7 0 0 1 9-8.4 8.7 8.7 0 0 1 9 8.4Z"/>',
  share: '<path d="M12 15V2.5m-4.2 4L12 2.3l4.2 4.2M7.5 9H5.8A1.8 1.8 0 0 0 4 10.8v8.4A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8v-8.4A1.8 1.8 0 0 0 18.2 9h-1.7"/>',
  download: '<path d="M12 3v12m-4.2-4.2L12 15l4.2-4.2M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  check: '<path d="m5 12 4.3 4.3L19 6.6"/>'
}

export function addIcon(control, icon, label) {
  control.classList.add('icon-action')
  control.setAttribute('aria-label',label)
  control.title = label
  control.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</svg>`
  return control
}
