// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Copyright 2008 Google Inc. All Rights Reserved.

/**
 * @fileoverview A singleton object for managing Javascript code modules.
 *
 */

goog.provide('goog.module.ModuleManager');

goog.require('goog.Disposable');
goog.require('goog.array');
goog.require('goog.async.Deferred');
goog.require('goog.debug.Logger');
goog.require('goog.debug.Trace');
goog.require('goog.module.ModuleInfo');
goog.require('goog.module.ModuleInfo.Callback');


/**
 * The ModuleManager keeps track of all modules in the environment.
 * Since modules may not have their code loaded, we must keep track of them.
 * @constructor
 * @extends {goog.Disposable}
 */
goog.module.ModuleManager = function() {
  goog.Disposable.call(this);

  /**
   * A mapping from module id to ModuleInfo object.
   * @type {Object}
   * @private
   */
  this.moduleInfoMap_ = {};

  /**
   * The ids of the currently loading modules. If batch mode is disabled, then
   * this array will never contain more than one element at a time.
   * @type {Array.<string>}
   * @private
   */
  this.loadingModuleIds_ = [];

  /**
   * A queue of the ids of requested but not-yet-loaded modules. The zero
   * position is the front of the queue.
   * @type {Array.<string>}
   * @private
   */
  this.requestedModuleIdsQueue_ = [];

  /**
   * The ids of the currently loading modules which have been initiated by user
   * actions.
   * @type {Array.<string>}
   * @private
   */
  this.userInitiatedLoadingModuleIds_ = [];

  /**
   * A map of callback types to the functions to call for the specified
   * callback type.
   * @type {Object}
   * @private
   */
  this.callbackMap_ = {};
};
goog.inherits(goog.module.ModuleManager, goog.Disposable);
goog.addSingletonGetter(goog.module.ModuleManager);

/**
* The type of callbacks that can be registered with the module manager,.
* @enum {string}
*/
goog.module.ModuleManager.CallbackType = {
  /**
   * Fired when an error has occurred.
   */
  ERROR: 'error',

  /**
   * Fired when it becomes idle and has no more module loads to process.
   */
  IDLE: 'idle',

  /**
   * Fired when it becomes active and has module loads to process.
   */
  ACTIVE: 'active',

  /**
   * Fired when it becomes idle and has no more user-initiated module loads to
   * process.
   */
  USER_IDLE: 'userIdle',

  /**
   * Fired when it becomes active and has user-initiated module loads to
   * process.
   */
  USER_ACTIVE: 'userActive'
};


/**
 * A logger.
 * @type {goog.debug.Logger}
 * @private
 */
goog.module.ModuleManager.prototype.logger_ = goog.debug.Logger.getLogger(
    'goog.module.ModuleManager');


/**
 * Whether the batch mode (i.e. the loading of multiple modules with just one
 * request) has been enabled.
 * @type {boolean}
 * @private
 */
goog.module.ModuleManager.prototype.batchModeEnabled_ = false;


/**
 * A loader for the modules that implements loadModules(ids, moduleInfoMap,
 * opt_successFn, opt_errorFn, opt_timeoutFn) method.
 * @type {goog.module.AbstractModuleLoader}
 * @private
 */
goog.module.ModuleManager.prototype.loader_ = null;


// TODO: Remove tracer.
/**
 * Tracer that measures how long it takes to load a module.
 * @type {number?}
 * @private
 */
goog.module.ModuleManager.prototype.loadTracer_ = null;


/**
 * The number of consecutive failures that have happened upon module load
 * requests.
 * @type {number}
 * @private
 */
goog.module.ModuleManager.prototype.consecutiveFailures_ = 0;


/**
 * Determines if the module manager was just active before the processing of
 * the last data.
 * @type {boolean}
 * @private
 */
goog.module.ModuleManager.prototype.lastActive_ = false;


/**
 * Determines if the module manager was just user active before the processing
 * of the last data. The module manager is user active if any of the
 * user-initiated modules are loading or queued up to load.
 * @type {boolean}
 * @private
 */
goog.module.ModuleManager.prototype.userLastActive_ = false;


/**
 * The module context needed for module initialization.
 * @type {Object?}
 * @private
 */
goog.module.ModuleManager.prototype.moduleContext_ = null;


/**
 * Sets the batch mode as enabled or disabled for the module manager.
 * @param {boolean} enabled Whether the batch mode is to be enabled or not.
 */
goog.module.ModuleManager.prototype.setBatchModeEnabled = function(
    enabled) {
  this.batchModeEnabled_ = enabled;
};


/**
 * Sets the module info for all modules. Should only be called once.
 *
 * @param {Object} infoMap A mapping from module id (String) to list of
 *     required module ids (Array).
 */
goog.module.ModuleManager.prototype.setAllModuleInfo = function(infoMap) {
  for (var id in infoMap) {
    this.moduleInfoMap_[id] = new goog.module.ModuleInfo(infoMap[id]);
  }
};


/**
 * Gets a module info object by id.
 * @param {string} id A module identifier.
 * @return {goog.module.ModuleInfo} The module info.
 */
goog.module.ModuleManager.prototype.getModuleInfo = function(id) {
  return this.moduleInfoMap_[id];
};


/**
 * Sets the module uris.
 *
 * @param {Object} moduleUriMap The map of id/uris pairs for each module.
 */
goog.module.ModuleManager.prototype.setModuleUris = function(moduleUriMap) {
  for (var id in moduleUriMap) {
    this.moduleInfoMap_[id].setUris(moduleUriMap[id]);
  }
};


/**
 * Gets the application-specific module loader.
 * @return {goog.module.AbstractModuleLoader} An object that has a
 *     loadModules(ids, moduleInfoMap, opt_successFn, opt_errFn,
 *         opt_timeoutFn) method.
 */
goog.module.ModuleManager.prototype.getLoader = function() {
  return this.loader_;
};


/**
 * Sets the application-specific module loader.
 * @param {goog.module.AbstractModuleLoader} loader An object that has a
 *     loadModules(ids, moduleInfoMap, opt_successFn, opt_errFn,
 *         opt_timeoutFn) method.
 */
goog.module.ModuleManager.prototype.setLoader = function(loader) {
  this.loader_ = loader;
};


/**
 * Gets the module context to use to initialize the module.
 * @return {Object} The context.
 */
goog.module.ModuleManager.prototype.getModuleContext = function() {
  return this.moduleContext_;
};


/**
 * Sets the module context to use to initialize the module.
 * @param {Object} context The context.
 */
goog.module.ModuleManager.prototype.setModuleContext = function(context) {
  this.moduleContext_ = context;
};


/**
 * Determines if the ModuleManager is active
 * @return {boolean} TRUE iff the ModuleManager is active (i.e., not idle).
 */
goog.module.ModuleManager.prototype.isActive = function() {
  return this.loadingModuleIds_.length > 0;
};


/**
 * Determines if the ModuleManager is user active
 * @return {boolean} TRUE iff the ModuleManager is user active (i.e., not idle).
 */
goog.module.ModuleManager.prototype.isUserActive = function() {
  return this.userInitiatedLoadingModuleIds_.length > 0;
};


/**
 * Dispatches an ACTIVE or IDLE event if necessary.
 * @private
 */
goog.module.ModuleManager.prototype.dispatchActiveIdleChangeIfNeeded_ =
    function() {
  var lastActive = this.lastActive_;
  var active = this.isActive();
  if (active != lastActive) {
    this.executeCallbacks_(active ?
        goog.module.ModuleManager.CallbackType.ACTIVE :
        goog.module.ModuleManager.CallbackType.IDLE);

    // Flip the last active value.
    this.lastActive_ = active;
  }

  // Check if the module manager is user active i.e., there are user initiated
  // modules being loaded or queued up to be loaded.
  var userLastActive = this.userLastActive_;
  var userActive = this.isUserActive();
  if (userActive != userLastActive) {
    this.executeCallbacks_(userActive ?
        goog.module.ModuleManager.CallbackType.USER_ACTIVE :
        goog.module.ModuleManager.CallbackType.USER_IDLE);

    // Flip the last user active value.
    this.userLastActive_ = userActive;
  }
};


/**
 * Preloads a module after a short delay.
 *
 * @param {string} id The id of the module to preload.
 * @param {number} opt_timeout The number of ms to wait before adding the module
 *     id to the loading queue (defaults to 0 ms). Note that the module will be
 *     loaded asynchronously regardless of the value of this parameter.
 * @return {goog.async.Deferred} A deferred object.
 */
goog.module.ModuleManager.prototype.preloadModule = function(
    id, opt_timeout) {
  var d = new goog.async.Deferred();
  window.setTimeout(
      goog.bind(this.loadModuleOrEnqueueIfNotLoadedOrLoading_, this, id, d),
      opt_timeout || 0);
  return d;
};


/**
 * Loads a specific module or, if some other module is currently being loaded,
 * appends its id to the queue of requested module ids. Does nothing if the
 * module is already loaded or is currently loading.
 *
 * @param {string} id The id of the module to load.
 * @param {goog.async.Deferred} d A deferred object.
 * @private
 */
goog.module.ModuleManager.prototype.
    loadModuleOrEnqueueIfNotLoadedOrLoading_ = function(id, d) {
  var moduleInfo = this.getModuleInfo(id);
  // TODO: Push deferred pattern further into module manager.
  if (moduleInfo.isLoaded()) {
    d.callback(this.moduleContext_);
  } else {
    moduleInfo.registerCallback(d.callback, d);
    moduleInfo.registerErrback(d.errback, d);
    if (!this.isModuleLoading(id)) {
      this.loadModuleOrEnqueue_(id);
    }
  }
};


/**
 * Initiates loading of a specific module or, if a module is currently being
 * loaded, appends the module's id to the queue of requested module ids.
 *
 * The caller should verify that the requested module is not already loaded or
 * loading. {@link #loadModuleOrEnqueueIfNotLoadedOrLoading_} is a more lenient
 * alternative to this method.
 *
 * @param {string} id The id of the module to load.
 * @private
 */
goog.module.ModuleManager.prototype.loadModuleOrEnqueue_ = function(id) {
  if (goog.array.isEmpty(this.loadingModuleIds_)) {
    this.loadModule_(id);
  } else {
    this.requestedModuleIdsQueue_.push(id);
    this.dispatchActiveIdleChangeIfNeeded_();
  }
};


/**
 * Loads a module and any of its not-yet-loaded prerequisites. If batch mode is
 * enabled, the prerequisites will be loaded together with the requested module.
 *
 * The caller should verify that the requested module is not already loaded
 * and that no modules are currently loading before calling this method.
 *
 * @param {string} id The id of the module to load.
 * @param {boolean} opt_isRetry If the load is a retry of a previous load
 *     attempt.
 * @private
 */
goog.module.ModuleManager.prototype.loadModule_ = function(
    id, opt_isRetry) {
  var moduleInfo = this.moduleInfoMap_[id];
  if (moduleInfo.isLoaded()) {
    throw Error('Module already loaded: ' + id);
  }

  // Build a list of the ids of this module and any of its not-yet-loaded
  // prerequisite modules in dependency order.
  var ids = this.getNotYetLoadedTransitiveDepIds_(id);

  if (!this.batchModeEnabled_ && ids.length > 1) {
    var idToLoad = ids.shift();
    this.logger_.info('Must load ' + idToLoad + ' module before ' + id);

    // Insert the requested module id and any other not-yet-loaded prereqs
    // that it has at the front of the queue.
    this.requestedModuleIdsQueue_ = ids.concat(this.requestedModuleIdsQueue_);
    ids = [idToLoad];
  }

  if (!opt_isRetry) {
    this.consecutiveFailures_ = 0;
  }

  this.logger_.info('Loading module(s): ' + ids);
  this.loadingModuleIds_ = ids;

  // Dispatch an active/idle change if needed.
  this.dispatchActiveIdleChangeIfNeeded_();

  this.loader_.loadModules(
      goog.array.clone(ids), this.moduleInfoMap_, null,
      goog.bind(this.handleLoadError_, this),
      goog.bind(this.handleLoadTimeout_, this));
};


/**
 * Builds a list of the ids of the not-yet-loaded modules that a particular
 * module transitively depends on, including itself.
 *
 * @param {string} id The id of a not-yet-loaded module.
 * @return {Array.<string>} An array of module ids in dependency order that's
 *     guaranteed to end with the provided module id.
 * @private
 */
goog.module.ModuleManager.prototype.getNotYetLoadedTransitiveDepIds_ =
    function(id) {
  // NOTE: We want the earliest occurrance of a module, not the first
  // dependency we find. Therefore we strip duplicates at the end rather than
  // during.  See the tests for concrete examples.
  var ids = [id];
  var depIds = goog.array.clone(this.getModuleInfo(id).getDependencies());
  while (depIds.length) {
    var depId = depIds.pop();
    if (!this.getModuleInfo(depId).isLoaded()) {
      ids.unshift(depId);
      // We need to process direct dependencies first.
      Array.prototype.unshift.apply(depIds,
          this.getModuleInfo(depId).getDependencies());
    }
  }
  goog.array.removeDuplicates(ids);
  return ids;
};


/**
 * Records that a module was loaded. Also initiates loading the next module if
 * any module requests are queued. This method is called by code that is
 * generated and appended to each dynamic module's code at compilation time.
 *
 * @param {string} id A module id.
 */
goog.module.ModuleManager.prototype.setLoaded = function(id) {
  this.logger_.info('Module loaded: ' + id);

  // Remove the module id from the user initiated set if it existed there.
  goog.array.remove(this.userInitiatedLoadingModuleIds_, id);

  // Remove the module id from the loading modules if it exists there.
  goog.array.remove(this.loadingModuleIds_, id);

  this.moduleInfoMap_[id].onLoad(goog.bind(this.getModuleContext, this));

  if (goog.array.isEmpty(this.loadingModuleIds_)) {
    // No more modules are currently being loaded (e.g. arriving later in the
    // same HTTP response), so proceed to load the next module in the queue.
    this.loadNextModule_();
  }

  // Dispatch an active/idle change if needed.
  this.dispatchActiveIdleChangeIfNeeded_();
};


/**
 * Gets whether a module is currently loading or in the queue, waiting to be
 * loaded.
 * @param {string} id A module id.
 * @return {boolean} TRUE iff the module is loading.
 */
goog.module.ModuleManager.prototype.isModuleLoading = function(id) {
  return goog.array.contains(this.loadingModuleIds_, id) ||
       goog.array.contains(this.requestedModuleIdsQueue_, id);
};


/**
 * Requests that a function be called once a particular module is loaded.
 * Client code can use this method to safely call into modules that may not yet
 * be loaded. For consistency, this method always calls the function
 * asynchronously -- even if the module is already loaded. Initiates loading of
 * the module if necessary, unless opt_noLoad is true.
 *
 * @param {string} moduleId A module id.
 * @param {Function} fn Function to execute when the module has loaded.
 * @param {Object} opt_handler Optional handler under whose scope to execute
 *     the callback.
 * @param {boolean} opt_noLoad TRUE iff not to initiate loading of the module.
 * @param {boolean} opt_userInitiated TRUE iff the loading of the module was
 *     user initiated.
 * @param {boolean} opt_preferSynchronous TRUE iff the function should be
 *     executed synchronously if the module has already been loaded.
 * @return {goog.module.ModuleInfo.Callback} A callback wrapper that exposes
 *     an abort and execute method.
 */
goog.module.ModuleManager.prototype.execOnLoad = function(
    moduleId, fn, opt_handler, opt_noLoad,
    opt_userInitiated, opt_preferSynchronous) {
  var moduleInfo = this.moduleInfoMap_[moduleId];
  var callbackWrapper;

  if (moduleInfo.isLoaded()) {
    this.logger_.info(moduleId + ' module already loaded');
    // Call async so that code paths don't change between loaded and unloaded
    // cases.
    callbackWrapper = new goog.module.ModuleInfo.Callback(fn, opt_handler);
    if (opt_preferSynchronous) {
      callbackWrapper.execute(this.moduleContext_);
    } else {
      window.setTimeout(
          goog.bind(callbackWrapper.execute, callbackWrapper), 0);
    }
  } else if (this.isModuleLoading(moduleId)) {
    this.logger_.info(moduleId + ' module already loading');
    callbackWrapper = moduleInfo.registerCallback(fn, opt_handler);
    if (opt_userInitiated) {
      this.logger_.info('User initiated module already loading: ' + moduleId);
      this.userInitiatedLoadingModuleIds_.push(moduleId);
      this.dispatchActiveIdleChangeIfNeeded_();
    }
  } else {
    this.logger_.info('Registering callback for module: ' + moduleId);
    callbackWrapper = moduleInfo.registerCallback(fn, opt_handler);
    if (!opt_noLoad) {
      if (opt_userInitiated) {
        this.logger_.info('User initiated module load: ' + moduleId);
        this.userInitiatedLoadingModuleIds_.push(moduleId);
      }
      this.logger_.info('Initiating module load: ' + moduleId);
      this.loadModuleOrEnqueue_(moduleId);
    }
  }
  return callbackWrapper;
};


/**
 * Loads a module, returning a goog.async.Deferred for keeping track of the
 * result.
 *
 * @param {string} moduleId A module id.
 * @return {goog.async.Deferred} A deferred object.
 */
goog.module.ModuleManager.prototype.load = function(moduleId) {
  var moduleInfo = this.moduleInfoMap_[moduleId];
  var d = new goog.async.Deferred();

  // TODO: Push deferred pattern further into module manager.
  if (moduleInfo.isLoaded()) {
    d.callback(this.moduleContext_);

  } else if (this.isModuleLoading(moduleId)) {
    this.logger_.info(moduleId + ' module already loading');
    moduleInfo.registerCallback(d.callback, d);
    moduleInfo.registerErrback(d.errback, d);

  } else {
    this.logger_.info('Registering callback for module: ' + moduleId);
    moduleInfo.registerCallback(d.callback, d);
    moduleInfo.registerErrback(d.errback, d);
    this.logger_.info('Initiating module load: ' + moduleId);
    this.loadModuleOrEnqueue_(moduleId);
  }

  return d;
};


/**
 * Method called just before a module code is loaded.
 * @param {string} id Identifier of the module.
 */
goog.module.ModuleManager.prototype.beforeLoadModuleCode = function(id) {
  this.loadTracer_ = goog.debug.Trace.startTracer('Module Load: ' + id,
      'Module Load');
  if (this.currentlyLoadingModule_) {
    this.logger_.severe('beforeLoadModuleCode called with module "' + id +
                        '" while module "' + this.currentlyLoadingModule_ +
                        '" is loading');
  }
  this.currentlyLoadingModule_ = id;
};


/**
 * Method called just after module code is loaded
 * @param {string} id Identifier of the module.
 */
goog.module.ModuleManager.prototype.afterLoadModuleCode = function(id) {
  if (id != this.currentlyLoadingModule_) {
    this.logger_.severe('afterLoadModuleCode called with module "' + id +
                        '" while loading module "' +
                        this.currentlyLoadingModule_ + '"');

  }
  this.currentlyLoadingModule_ = null;
  goog.debug.Trace.stopTracer(this.loadTracer_);
};


/**
 * Register an initialization callback for the currently loading module. This
 * should only be called by script that is executed during the evaluation of
 * a module's javascript. This is almost equivalent to calling the function
 * inline, but ensures that all the code from the currently loading module
 * has been loaded. This makes it cleaner and more robust than calling the
 * function inline.
 * @param {Function} fn A callback function that takes a single argument
 *    which is the module context.
 * @param {Object} opt_handler Optional handler under whose scope to execute
 *     the callback.
 */
goog.module.ModuleManager.prototype.registerInitializationCallback = function(
    fn, opt_handler) {
  if (!this.currentlyLoadingModule_) {
    this.logger_.severe('No module is currently loading');
    return;
  }
  this.getModuleInfo(this.currentlyLoadingModule_).registerEarlyCallback(
      fn, opt_handler);
};


/**
 * The possible reasons for a module load failure callback being fired.
 * @enum {number}
 */
goog.module.ModuleManager.FailureType = {
  /** 401 Status. */
  UNAUTHORIZED: 0,

  /** Error status (not 401) returned multiple times. */
  CONSECUTIVE_FAILURES: 1,

  /** Request timeout. */
  TIMEOUT: 2,

  /** 410 status, old code gone. */
  OLD_CODE_GONE: 3
};


/**
 * Handles a module load failure.
 *
 * @param {number} status The error status.
 * @private
 */
goog.module.ModuleManager.prototype.handleLoadError_ = function(status) {
  this.consecutiveFailures_++;
  if (status == 401) {
    // The user is not logged in. They've cleared their cookies or logged out
    // from another window.
    this.logger_.info('Module loading unauthorized');
    this.dispatchModuleLoadFailed_(
        goog.module.ModuleManager.FailureType.UNAUTHORIZED);
    // Drop any additional module requests.
    this.requestedModuleIdsQueue_.length = 0;
  } else if (status == 410) {
    // The requested module js is old and not available.
    this.dispatchModuleLoadFailed_(
          goog.module.ModuleManager.FailureType.OLD_CODE_GONE);
    this.loadNextModule_();
  } else if (this.consecutiveFailures_ >= 3) {
    this.logger_.info('Aborting after failure to load: ' +
                      this.loadingModuleIds_);
    this.dispatchModuleLoadFailed_(
        goog.module.ModuleManager.FailureType.CONSECUTIVE_FAILURES);
    this.loadNextModule_();
  } else {
    this.logger_.info('Retrying after failure to load: ' +
                      this.loadingModuleIds_);
    // The last value in loadingModuleIds_ is the requested id, (with others
    // before it being its dependencies). We call loadModule_ again because
    // batchModeEnabled_ may have changed.
    var id = this.loadingModuleIds_.pop();
    this.loadingModuleIds_.length = 0;
    this.loadModule_(id, true);
  }
};


/**
 * Handles a module load timeout.
 * @private
 */
goog.module.ModuleManager.prototype.handleLoadTimeout_ = function() {
  this.logger_.info('Aborting after timeout: ' + this.loadingModuleIds_);
  this.dispatchModuleLoadFailed_(goog.module.ModuleManager.FailureType.TIMEOUT);
  this.loadNextModule_();
};


/**
 * Handles when a module load failed.
 * @param {goog.module.ModuleManager.FailureType} cause The reason for the
 *     failure.
 * @private
 */
goog.module.ModuleManager.prototype.dispatchModuleLoadFailed_ = function(
    cause) {
  // The explicitly requested id is the last value in loadingModuleIds_.  All
  // the others are dependencies of the requested id.
  var id = this.loadingModuleIds_.pop();
  this.loadingModuleIds_.length = 0;

  // If any pending modules depend on the id that failed,
  // they need to be removed from the queue.
  var self = this;
  var idsToCancel = goog.array.filter(
      this.requestedModuleIdsQueue_,
      function(requestedId) {
        return goog.array.contains(
            self.getNotYetLoadedTransitiveDepIds_(requestedId),
            id);
      });
  if (id) {
    goog.array.insert(idsToCancel, id);
  }

  for (var i = 0; i < idsToCancel.length; i++) {
    goog.array.remove(this.requestedModuleIdsQueue_, idsToCancel[i]);
    goog.array.remove(this.userInitiatedLoadingModuleIds_, idsToCancel[i]);
  }

  // Call the functions for error notification.
  var errorCallbacks = this.callbackMap_[
      goog.module.ModuleManager.CallbackType.ERROR];
  if (errorCallbacks) {
    for (var i = 0; i < errorCallbacks.length; i++) {
      var callback = errorCallbacks[i];
      for (var j = 0; j < idsToCancel.length; j++) {
        callback(goog.module.ModuleManager.CallbackType.ERROR, idsToCancel[j],
            cause);
      }
    }
  }

  // Call the errbacks on the module info.
  if (this.moduleInfoMap_[id]) {
    this.moduleInfoMap_[id].onError(cause);
  }

  this.dispatchActiveIdleChangeIfNeeded_();
};


/**
 * Loads the next module on the queue.
 * @private
 */
goog.module.ModuleManager.prototype.loadNextModule_ = function() {
  while (this.requestedModuleIdsQueue_.length) {
    var nextId = this.requestedModuleIdsQueue_.shift();
    if (!this.getModuleInfo(nextId).isLoaded()) {
      this.loadModule_(nextId);
      return;
    }
  }

  // Dispatch an active/idle change if needed.
  this.dispatchActiveIdleChangeIfNeeded_();
};


/**
 * The function to call if the module manager is in error.
 * @param {goog.module.ModuleManager.CallbackType|Array.<goog.module.ModuleManager.CallbackType>} types
 *  The callback type.
 * @param {Function} fn The function to register as a callback.
 */
goog.module.ModuleManager.prototype.registerCallback = function(
    types, fn) {
  if (!goog.isArray(types)) {
    types = [types];
  }

  for (var i = 0; i < types.length; i++) {
    this.registerCallback_(types[i], fn);
  }
};


/**
 * Register a callback for the specified callback type.
 * @param {goog.module.ModuleManager.CallbackType} type The callback type.
 * @param {Function} fn The callback function.
 * @private
 */
goog.module.ModuleManager.prototype.registerCallback_ = function(type, fn) {
  var callbackMap = this.callbackMap_;
  if (!callbackMap[type]) {
    callbackMap[type] = [];
  }
  callbackMap[type].push(fn);
};


/**
 * Call the callback functions of the specified type.
 * @param {goog.module.ModuleManager.CallbackType} type The callback type.
 * @private
 */
goog.module.ModuleManager.prototype.executeCallbacks_ = function(type) {
  var callbacks = this.callbackMap_[type];
  for (var i = 0; callbacks && i < callbacks.length; i++) {
    callbacks[i](type);
  }
};


/**
 * Disposes of the module manager.
 */
goog.module.ModuleManager.prototype.disposeInternal = function() {
  goog.module.ModuleManager.superClass_.disposeInternal.call(this);

  // Dispose of each ModuleInfo object.
  goog.array.forEach(goog.object.getValues(this.moduleInfoMap_), goog.dispose);
  this.moduleInfoMap_ = null;
  this.loadingModuleIds_ = null;
  this.userInitiatedLoadingModuleIds_ = null;
  this.requestedModuleIdsQueue_ = null;
  this.callbackMap_ = null;
};
