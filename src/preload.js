'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pihole', {
  connect:       (opts) => ipcRenderer.invoke('connect', opts),
  disconnect:    ()     => ipcRenderer.invoke('disconnect'),
  getARecords:   ()     => ipcRenderer.invoke('get-a-records'),
  addARecord:    (opts) => ipcRenderer.invoke('add-a-record', opts),
  deleteARecord: (opts) => ipcRenderer.invoke('delete-a-record', opts),
  getCnames:     ()     => ipcRenderer.invoke('get-cnames'),
  addCname:      (opts) => ipcRenderer.invoke('add-cname', opts),
  deleteCname:   (opts) => ipcRenderer.invoke('delete-cname', opts),
  loadConfig:    ()     => ipcRenderer.invoke('load-config'),
  saveConfig:    (opts) => ipcRenderer.invoke('save-config', opts),
  deleteConfig:  ()     => ipcRenderer.invoke('delete-config'),
});
