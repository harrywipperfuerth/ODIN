import L from 'leaflet'
import * as R from 'ramda'
import './handles.css'
import { doublyLinkedList, circularDoublyLinkedList } from '../../shared/lists'

// Marker types:
const MARKER_UPDATE = 'update-point'
const MARKER_ADD = 'add-point'

const initialize = function (geometry, callback) {
  L.LayerGroup.prototype.initialize.call(this)
  this.geometry = geometry
  this.callback = callback
  this.list = geometry.type === 'LineString' ? doublyLinkedList() : circularDoublyLinkedList()
}

const onAdd = function () {
  this.setup()
}

const onRemove = function () {
  this.dispose()
}

const markers = function () {
  return this.list.filter(marker => marker.type === MARKER_UPDATE)
}

const length = function () {
  return this.markers().length
}

const createMarker = function (latlng, options) {
  const className = options.type === MARKER_UPDATE ? 'marker-icon' : 'marker-icon marker-icon-middle'
  const marker = new L.Marker(latlng, {
    draggable: true,
    icon: L.divIcon({ className })
  })

  // Disable click event on map while dragging:
  marker.on('dragstart', ({ target }) => target._map.tools.disableMapClick())
  marker.on('dragend', ({ target }) => target._map.tools.enableMapClick())
  marker.on('click', () => {}) // must not bubble up to map.
  marker.on('drag', options.drag, this)

  if (options.dragend) marker.on('dragend', options.dragend, this)
  if (options.mousedown) marker.on('mousedown', options.mousedown, this)

  marker.type = options.type
  marker.addTo(this)
  return marker
}

const removeMarker = function (marker) {
  const remove = marker => {
    this.removeLayer(marker)
    this.list.remove(marker)
  }

  remove(marker.succ ? marker.succ : marker.pred)
  remove(marker)
}

const appendMarker = function (latlng, options, other) {
  this.list.append(this.createMarker(latlng, options), other)
}

const emitEvent = function (channel) {

  return () => {
    const latlngs = this.markers().map(marker => marker.getLatLng())
    const type = this.geometry.type
    this.callback({ channel, type, latlngs })
  }
}

const updatePoint = function () {
  this.emitEvent('drag')()

  // Update mid-point marker positions:
  this.markers().forEach(marker => {
    const midpointMarker = marker.succ

    // Account for last point in polyline:
    if (!midpointMarker) return
    const latlng = L.LatLng.midpoint([marker.getLatLng(), midpointMarker.succ.getLatLng()])
    midpointMarker.setLatLng(latlng)
  })
}

const removePoint = function (event) {
  let timeout
  const { target: marker, originalEvent } = event
  if (this.length() === L.Feature.Polystar.minimumPoints(this.geometry)) return

  const remove = () => {
    this.removeMarker(marker)
    this.updatePoint()
    this.emitEvent('dragend')
  }

  const clearTimer = () => {
    if (!timeout) return
    clearTimeout(timeout)
    timeout = null
  }

  if (originalEvent.ctrlKey) R.compose(remove, clearTimer)()
  else {
    // Start timer to track long mouse press:
    timeout = setTimeout(remove, 550)
    marker.once('mouseup', clearTimer)
    marker.once('drag', clearTimer)
  }
}

const addPoint = function ({ target: marker }) {

  // 'Convert' mid-point to regular marker:
  marker.type = MARKER_UPDATE
  L.DomUtil.removeClass(marker._icon, 'marker-icon-middle')
  marker.off('drag', this.addPoint, this)
  marker.on('drag', this.updatePoint, this)
  marker.on('dragend', this.emitEvent('dragend'), this)
  marker.on('mousedown', this.removePoint, this)

  // Insert two mid-point markers before and after target marker:
  const options = { type: MARKER_ADD, drag: this.addPoint }
  const lls = L.LatLng.midpoint([marker.getLatLng(), marker.succ.getLatLng()])
  this.list.append(this.createMarker(lls, options), marker)
  const llp = L.LatLng.midpoint([marker.getLatLng(), marker.pred.getLatLng()])
  this.list.prepend(this.createMarker(llp, options), marker)
}

const setup = function () {
  // Create initial set of markers.
  L.Feature.Polystar.latlngs(this.geometry).forEach(latlng => {
    const options = {
      type: MARKER_UPDATE,
      drag: this.updatePoint,
      dragend: this.emitEvent('dragend'),
      mousedown: this.removePoint
    }
    this.appendMarker(latlng, options)
  })

  this.markers().forEach(marker => {
    if (!marker.succ) return
    const latlng = L.LatLng.midpoint([marker.getLatLng(), marker.succ.getLatLng()])
    const options = { type: MARKER_ADD, drag: this.addPoint }
    this.appendMarker(latlng, options, marker)
  })
}

const dispose = function () {
  this.list.filter(() => true).forEach(marker => {
    this.removeLayer(marker)
    this.list.remove(marker)
    // TODO: do we need marker.dispose() to cleanup listener?
  })
}

const updateGeometry = function (geometry) {
  this.dispose()
  this.geometry = geometry
  this.setup()
}

L.Feature.MarkerGroup = L.LayerGroup.extend({
  initialize,
  onAdd,
  onRemove,

  markers,
  length,
  createMarker,
  removeMarker,
  appendMarker,

  emitEvent,
  updatePoint,
  removePoint,
  addPoint,

  setup,
  dispose,
  updateGeometry
})
