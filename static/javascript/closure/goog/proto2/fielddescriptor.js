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
 * @fileoverview Protocol Buffer Field Descriptor class.
 */

goog.provide('goog.proto2.FieldDescriptor');

goog.require('goog.proto2.Util');
goog.require('goog.string');


/**
 * A class which describes a field in a Protocol Buffer 2 Message.
 *
 * @param {Function} messageType Constructor for the message
 *     class to which the field described by this class belongs.
 * @param {number|string} tag The field's tag index.
 * @param {Object} metadata The metadata about this field that will be used
 *     to construct this descriptor.
 *
 * @constructor
 */
goog.proto2.FieldDescriptor = function(messageType, tag, metadata) {
  /**
   * The message type that contains the field that this
   * descriptor describes.
   * @type {Function}
   * @private
   */
  this.parent_ = messageType;

  // Ensure that the tag is numeric.
  goog.proto2.Util.assert(goog.string.isNumeric(tag));

  /**
   * The field's tag number.
   * @type {number}
   * @private
   */
  this.tag_ = /** @type {number} */ (tag);

  /**
   * The field's name.
   * @type {string}
   * @private
   */
  this.name_ = metadata.name;

  /**
   * If true, this field is a repeating field.
   * @type {boolean}
   * @private
   */
  this.isRepeated_ = !!metadata.repeated;

  /**
   * If true, this field is required.
   * @type {boolean}
   * @private
   */
  this.isRequired_ = !!metadata.required;

  /**
   * The field type of this field.
   * @type {goog.proto2.Message.FieldType}
   * @private
   */
  this.fieldType_ = metadata.fieldType;

  /**
   * If this field is a primitive: The native (ECMAScript) type of this field.
   * If an enumeration: The enumeration object.
   * If a message or group field: The Message function.
   * @type {Object}
   * @private
   */
  this.nativeType_ = metadata.type;

  /**
   * The default value of this field, if different from the default, default
   * value.
   * @type {Object|undefined}
   * @private
   */
  this.defaultValue_ = metadata.defaultValue;
};


/**
 * Returns the tag of the field that this descriptor represents.
 *
 * @return {number} The tag number.
 */
goog.proto2.FieldDescriptor.prototype.getTag = function() {
  return this.tag_;
};


/**
 * Returns the descriptor describing the message that defined this field.
 * @return {goog.proto2.Descriptor} The descriptor.
 */
goog.proto2.FieldDescriptor.prototype.getContainingType = function() {
  return this.parent_.descriptor_;
};


/**
 * Returns the name of the field that this descriptor represents.
 * @return {String} The name.
 */
goog.proto2.FieldDescriptor.prototype.getName = function() {
  return this.name_;
};


/**
 * Returns the default value of this field.
 * @return {Object} The default value.
 */
goog.proto2.FieldDescriptor.prototype.getDefaultValue = function() {
  if (this.defaultValue_ === undefined) {
    // Set the default value based on a new instance of the native type.
    // This will be (0, false, "") for (number, boolean, string) and will
    // be a new instance of a group/message if the field is a message type.
    this.defaultValue_ = new this.nativeType_;
  }

  return /** @type {Object} */ (this.defaultValue_);
};


/**
 * Returns the field type of the field described by this descriptor.
 * @return {goog.proto2.Message.FieldType} The field type.
 */
goog.proto2.FieldDescriptor.prototype.getFieldType = function() {
  return this.fieldType_;
};


/**
 * Returns the native (i.e. ECMAScript) type of the field described by this
 * descriptor.
 *
 * @return {Object} The native type.
 */
goog.proto2.FieldDescriptor.prototype.getNativeType = function() {
  return this.nativeType_;
};


/**
 * Returns the descriptor of the message type of this field. Only valid
 * for fields of type GROUP and MESSAGE.
 *
 * @return {goog.proto2.Descriptor} The message descriptor.
 */
goog.proto2.FieldDescriptor.prototype.getFieldMessageType = function() {
  goog.proto2.Util.assert(
      this.fieldType_ == goog.proto2.Message.FieldType.MESSAGE ||
      this.fieldType_ == goog.proto2.Message.FieldType.GROUP,
      'Expected message or group');

  return this.nativeType_.descriptor_;
};


/**
 * Returns whether the field described by this descriptor is repeating.
 * @return {Boolean} Whether the field is repeated.
 */
goog.proto2.FieldDescriptor.prototype.isRepeated = function() {
  return this.isRepeated_;
};


/**
 * Returns whether the field described by this descriptor is required.
 * @return {Boolean} Whether the field is required.
 */
goog.proto2.FieldDescriptor.prototype.isRequired = function() {
  return this.isRequired_;
};


/**
 * Returns whether the field described by this descriptor is optional.
 * @return {Boolean} Whether the field is optional.
 */
goog.proto2.FieldDescriptor.prototype.isOptional = function() {
  return !this.isRepeated_ && !this.isRequired_;
};
