const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/cible_muse.json'),
    ],
  })
  // Desktop / incompatible-device page, styled like raphaelerba.art.
  LandingPage.configure({
    backgroundColor: '#222222',
    textColor: '#eeeeee',
    font: "'Roboto', sans-serif",
    logoSrc: 'assets/muse/logo.png',
    logoAlt: 'Raphaël Erba',
    promptPrefix: 'Scanne ou ouvre',
    promptSuffix: 'sur ton téléphone',
  })
  XR8.addCameraPipelineModule(LandingPage.pipelineModule())
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

