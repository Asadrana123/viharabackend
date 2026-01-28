let ioInstance = null;

const setIoInstance = (io) => {
  ioInstance = io;
};

const getIoInstance = () => {
  return ioInstance;
};

module.exports = { setIoInstance, getIoInstance };