import React, { Suspense } from 'react'
import { makeStyles } from '@material-ui/core/styles'
import 'typeface-roboto'

import './i18n'
import './ipc'
import evented from './evented'
import OSD from './components/OSD'
import Map from './map/Map'
import ProjectManagement from './components/ProjectManagement'
import BasemapManagement from './components/BasemapManagement'
import Activities from './components/Activities'
import PropertyPanel from './components/properties/PropertyPanel'

import { ipcRenderer } from 'electron'
import { getCurrentWindow } from '@electron/remote'


import extendMilsymbols from './components/milsymbol/msExtend'
extendMilsymbols()

const useStyles = makeStyles((/* theme */) => ({
  overlay: {
    pointerEvents: 'none',
    position: 'fixed',
    top: '0.5em',
    left: '0.5em',
    bottom: '5em',
    right: '0.5em',
    zIndex: 20,
    display: 'grid',
    gridTemplateColumns: 'auto',
    gridTemplateRows: '1fr 12fr',
    gridGap: '1em'
  },

  contentPanel: {
    gridRowStart: 2,
    gridColumnStart: 1,
    display: 'grid',

    // Activity Bar width: 40px = 24px icon + 2 x 8px padding
    gridTemplateColumns: '48px 20em auto 26em',
    gridGap: '0.5em',
    // minHeight and minmax for template rows are required to limit the height of the panel
    // otherwise it will be 'auto' which allows the panel to grow
    // by content size
    gridTemplateRows: 'minmax(0, 1fr)',
    minHeight: 0,

    // A: activity bar (buttons to show specific tool panel),
    // L: left/tools panel (tools, palette, layers, ORBAT, etc.)
    // R: right/properties panel (properties)
    gridTemplateAreas: `
      "A L . R"
    `
  },

  propertiesPanel: {
    gridArea: 'R',
    pointerEvents: 'auto'
  }
}))



const App = (props) => {
  const classes = useStyles()
  const mapProps = { ...props, id: 'map' }

  const [showManagement, setManagement] = React.useState(null)
  const [currentProjectPath, setCurrentProjectPath] = React.useState(undefined)

  React.useEffect(() => {
    setCurrentProjectPath(getCurrentWindow().path)

    /*  Tell the main process that React has finished rendering of the App */
    setTimeout(() => ipcRenderer.send('IPC_APP_RENDERING_COMPLETED'), 0)
    ipcRenderer.on('IPC_SHOW_PROJECT_MANAGEMENT', () => setManagement('PROJECT_MANAGEMENT'))
    ipcRenderer.on('IPC_SHOW_BASEMAP_MANAGEMENT', () => setManagement('BASEMAP_MANAGEMENT'))

    /*
      Normally we need to return a cleanup function in order to remove listeners. Since
      this is the root of our react app, the only way to unload the component is to
      close the window - which destroys the ipcRenderer instance. Thus we omit this good
      practice and do not return any clean up functionality.
    */
  }, [])

  React.useEffect(() => {
    if (showManagement) return
    if (!currentProjectPath) return

    /*
      When a project gets renamed the window title is set accordingly.
      Since we use the current window for reading the project path
      we can also do so for the project name.
    */
    const projectName = getCurrentWindow().getTitle()
    evented.emit('OSD_MESSAGE', { message: projectName, slot: 'A1' })

    /*
      loading map tiles and features takes some time, so we
      create the preview of the map after 1s
    */
    const appLoadedTimer = setTimeout(() => {
      ipcRenderer.send('IPC_CREATE_PREVIEW', currentProjectPath)
    }, 1000)

    return () => clearTimeout(appLoadedTimer)
  }, [showManagement, currentProjectPath])

  const projectManagement = () => <ProjectManagement
    currentProjectPath={currentProjectPath}
    onCloseClicked={() => setManagement(null)}
  />

  const basemapManagement = () => <BasemapManagement
    onCloseClicked={() => setManagement(null)}
  />

  const currentManagementTool = () => {
    if (!showManagement) return null
    switch (showManagement) {
      case 'PROJECT_MANAGEMENT': return projectManagement()
      case 'BASEMAP_MANAGEMENT': return basemapManagement()
    }
  }

  return (
    <>
      <Map { ...mapProps }/>
      <div className={classes.overlay}>
        <OSD />
        <div className={classes.contentPanel}>
          <Suspense fallback={<div>loading...</div>}>
            <Activities/>
          </Suspense>
          <PropertyPanel/>
        </div>
      </div>
      { currentManagementTool() }
    </>
  )
}

export default App
