const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/cible_muse.json'),
      require('../image-targets/cible_tremplin.json'),
      require('../image-targets/cible_apple.json'),
    ],
  })
  // Desktop / incompatible-device page, styled like raphaelerba.art.
  LandingPage.configure({
    backgroundColor: '#222222',
    textColor: '#eeeeee',
    font: "'Roboto', sans-serif",
    promptPrefix: 'Scanne ou ouvre',
    promptSuffix: 'sur ton téléphone',
  })
  XR8.addCameraPipelineModule(LandingPage.pipelineModule())
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

// Header and footer around the landing page, as on raphaelerba.art (icons from the site).
const SITE = 'https://raphaelerba.art'
const SOCIAL = [
  {name: 'Instagram', href: 'https://www.instagram.com/raphaelerba/', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24"><g><path d="M15,5.4c2.1,0,2.4,0,3.2,0c0.8,0,1.2,0.2,1.5,0.3c0.4,0.1,0.6,0.3,0.9,0.6c0.3,0.3,0.5,0.5,0.6,0.9 c0.1,0.3,0.2,0.7,0.3,1.5c0,0.8,0,1.1,0,3.2s0,2.4,0,3.2c0,0.8-0.2,1.2-0.3,1.5c-0.1,0.4-0.3,0.6-0.6,0.9c-0.3,0.3-0.5,0.5-0.9,0.6 c-0.3,0.1-0.7,0.2-1.5,0.3c-0.8,0-1.1,0-3.2,0s-2.4,0-3.2,0c-0.8,0-1.2-0.2-1.5-0.3c-0.4-0.1-0.6-0.3-0.9-0.6 c-0.3-0.3-0.5-0.5-0.6-0.9c-0.1-0.3-0.2-0.7-0.3-1.5c0-0.8,0-1.1,0-3.2s0-2.4,0-3.2c0-0.8,0.2-1.2,0.3-1.5c0.1-0.4,0.3-0.6,0.6-0.9 c0.3-0.3,0.5-0.5,0.9-0.6c0.3-0.1,0.7-0.2,1.5-0.3C12.6,5.4,12.9,5.4,15,5.4 M15,4c-2.2,0-2.4,0-3.3,0c-0.9,0-1.4,0.2-1.9,0.4 c-0.5,0.2-1,0.5-1.4,0.9C7.9,5.8,7.6,6.2,7.4,6.8C7.2,7.3,7.1,7.9,7,8.7C7,9.6,7,9.8,7,12s0,2.4,0,3.3c0,0.9,0.2,1.4,0.4,1.9 c0.2,0.5,0.5,1,0.9,1.4c0.4,0.4,0.9,0.7,1.4,0.9c0.5,0.2,1.1,0.3,1.9,0.4c0.9,0,1.1,0,3.3,0s2.4,0,3.3,0c0.9,0,1.4-0.2,1.9-0.4 c0.5-0.2,1-0.5,1.4-0.9c0.4-0.4,0.7-0.9,0.9-1.4c0.2-0.5,0.3-1.1,0.4-1.9c0-0.9,0-1.1,0-3.3s0-2.4,0-3.3c0-0.9-0.2-1.4-0.4-1.9 c-0.2-0.5-0.5-1-0.9-1.4c-0.4-0.4-0.9-0.7-1.4-0.9c-0.5-0.2-1.1-0.3-1.9-0.4C17.4,4,17.2,4,15,4L15,4L15,4z"/><path d="M15,7.9c-2.3,0-4.1,1.8-4.1,4.1s1.8,4.1,4.1,4.1s4.1-1.8,4.1-4.1S17.3,7.9,15,7.9L15,7.9z M15,14.7c-1.5,0-2.7-1.2-2.7-2.7 c0-1.5,1.2-2.7,2.7-2.7s2.7,1.2,2.7,2.7C17.7,13.5,16.5,14.7,15,14.7L15,14.7z"/><path d="M20.2,7.7c0,0.5-0.4,1-1,1s-1-0.4-1-1s0.4-1,1-1S20.2,7.2,20.2,7.7L20.2,7.7z"/></g></svg>'},
  {name: 'TikTok', href: 'https://www.tiktok.com/@raphaelerba', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24"><path d="M22,10.4c-0.1,0-0.3,0-0.4,0c-1.5,0-2.9-0.7-3.7-2v6.8c0,2.8-2.2,5-5,5s-5-2.2-5-5s2.2-5,5-5l0,0c0.1,0,0.2,0,0.3,0v2.5 c-0.1,0-0.2,0-0.3,0c-1.4,0-2.5,1.1-2.5,2.5c0,1.4,1.1,2.5,2.5,2.5c1.4,0,2.7-1.1,2.7-2.5l0-11.5H18c0.2,2.1,1.9,3.8,4,3.9L22,10.4" /></svg>'},
  {name: 'Threads', href: 'https://www.threads.com/@raphaelerba', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24"><path d="M19.1722 11.3454C19.0971 11.31 19.0208 11.2759 18.9435 11.2433C18.8089 8.80519 17.454 7.40937 15.1789 7.39508C15.1686 7.39502 15.1583 7.39502 15.148 7.39502C13.7872 7.39502 12.6554 7.96615 11.9588 9.00541L13.2101 9.84935C13.7305 9.07306 14.5472 8.90756 15.1486 8.90756C15.1556 8.90756 15.1625 8.90757 15.1694 8.90763C15.9185 8.91232 16.4838 9.12648 16.8497 9.5441C17.1159 9.84815 17.294 10.2683 17.3822 10.7985C16.718 10.6876 15.9997 10.6534 15.2318 10.6967C13.0688 10.8192 11.6782 12.0596 11.7716 13.7832C11.819 14.6575 12.2619 15.4096 13.0188 15.901C13.6588 16.3163 14.483 16.5195 15.3396 16.4735C16.4709 16.4125 17.3584 15.9881 17.9775 15.2121C18.4477 14.6229 18.7451 13.8592 18.8764 12.897C19.4155 13.2169 19.8151 13.6379 20.0357 14.1439C20.411 15.0042 20.4329 16.4178 19.2597 17.5703C18.2319 18.58 16.9963 19.0168 15.1291 19.0303C13.0578 19.0152 11.4913 18.362 10.4729 17.089C9.51916 15.897 9.02627 14.1752 9.00788 11.9714C9.02627 9.76765 9.51916 8.04585 10.4729 6.85381C11.4913 5.58079 13.0578 4.92767 15.1291 4.91254C17.2153 4.92779 18.8091 5.58405 19.8666 6.86321C20.3851 7.49049 20.776 8.27935 21.0337 9.19913L22.5 8.81448C22.1876 7.68233 21.6961 6.70675 21.0272 5.89767C19.6715 4.25773 17.6888 3.41742 15.1342 3.39999H15.1239C12.5745 3.41736 10.614 4.26087 9.29693 5.90707C8.12493 7.37199 7.52038 9.41032 7.50006 11.9654L7.5 11.9714L7.50006 11.9774C7.52038 14.5325 8.12493 16.5709 9.29693 18.0358C10.614 19.682 12.5745 20.5255 15.1239 20.5429H15.1342C17.4008 20.5274 18.9984 19.9439 20.3146 18.651C22.0366 16.9595 21.9848 14.8392 21.4172 13.5376C21.01 12.6042 20.2337 11.8461 19.1722 11.3454ZM15.2587 14.9631C14.3106 15.0156 13.3257 14.5972 13.2772 13.7011C13.2412 13.0366 13.7581 12.2952 15.3168 12.2069C15.4954 12.1967 15.6705 12.1918 15.8426 12.1918C16.4088 12.1918 16.9385 12.2459 17.42 12.3494C17.2404 14.5549 16.1869 14.913 15.2587 14.9631Z" /></svg>'},
  {name: 'YouTube', href: 'https://www.youtube.com/@raphael_erba', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24"><path d="M26.15 16.54c0 0-0.22 1.57-0.9 2.26c-0.87 0.91-1.84 0.91-2.28 0.96C19.78 20 15 20 15 20 s-5.91-0.05-7.74-0.23c-0.51-0.09-1.64-0.07-2.51-0.97c-0.68-0.69-0.91-2.26-0.91-2.26s-0.23-1.84-0.23-3.68v-1.73 c0-1.84 0.23-3.68 0.23-3.68s0.22-1.57 0.91-2.26c0.87-0.91 1.83-0.91 2.28-0.96C10.22 4 15 4 15 4H15c0 0 4.8 0 8 0.2 c0.44 0.1 1.4 0.1 2.3 0.96c0.68 0.7 0.9 2.3 0.9 2.26s0.23 1.8 0.2 3.68v1.73C26.38 14.7 26.1 16.5 26.1 16.54z M12.65 8.56l0 6.39l6.15-3.18L12.65 8.56z"/></svg>'},
]

const addLandingFrame = () => {
  const style = document.createElement('style')
  style.textContent = `
    .muse-frame { position: fixed; left: 0; right: 0; z-index: 2147483000; text-align: center;
      font-family: 'Roboto', sans-serif; color: #eeeeee; pointer-events: none; }
    .muse-frame a { pointer-events: auto; color: inherit; }
    .muse-header { top: 16px; }
    .muse-header a { display: inline-block; text-decoration: none; }
    .muse-header img { display: block; height: 64px; width: auto; margin: 0 auto; }
    .muse-header span { display: block; margin-top: 2px; font-size: 15px; line-height: 1;
      text-transform: uppercase; color: #ffffff; }
    .muse-footer { bottom: 14px; font-size: 14px; }
    .muse-footer .muse-title { font-size: 18px; font-weight: 500; }
    .muse-footer > a { display: inline-block; margin-top: 4px; text-decoration: underline; text-underline-offset: 3px; }
    .muse-social { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
    .muse-social a { display: block; width: 36px; height: 30px; opacity: 0.85; }
    .muse-social a:hover, .muse-footer > a:hover { opacity: 1; color: #ffffff; }
    .muse-social svg { width: 100%; height: 100%; fill: currentColor; }
    @media (max-height: 640px) {
      .muse-header img { height: 44px; } .muse-header span { font-size: 11px; } .muse-header { top: 8px; }
    }
  `
  const header = document.createElement('div')
  header.className = 'muse-frame muse-header'
  header.innerHTML = `<a href="${SITE}" target="_blank" rel="noopener" aria-label="Raphaël Erba">` +
    '<img src="assets/logo-header.png" alt=""><span>Raphaël Erba</span></a>'
  const footer = document.createElement('div')
  footer.className = 'muse-frame muse-footer'
  footer.innerHTML = '<div class="muse-title">Découvrez mon travail</div>' +
    `<a href="${SITE}" target="_blank" rel="noopener">raphaelerba.art</a>` +
    '<div class="muse-social">' +
    SOCIAL.map(s => `<a href="${s.href}" target="_blank" rel="noopener" aria-label="${s.name}">${s.svg}</a>`).join('') +
    '</div>'

  // Only while the landing page is shown (desktop), never over the AR view.
  const sync = () => {
    const shown = !!document.querySelector('.landing8-container')
    if (shown && !header.isConnected) {
      document.head.appendChild(style)
      document.body.append(header, footer)
    } else if (!shown && header.isConnected) {
      header.remove()
      footer.remove()
    }
  }
  new MutationObserver(sync).observe(document.body, {childList: true, subtree: true})
  sync()
}
document.body ? addLandingFrame() : window.addEventListener('DOMContentLoaded', addLandingFrame)
