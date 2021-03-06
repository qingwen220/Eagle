/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function() {
	'use strict';

	var eagleControllers = angular.module('eagleControllers');

	// ======================================================================================
	// =                                    Policy Create                                   =
	// ======================================================================================
	function connectPolicyEditController(entity, args) {
		var newArgs = [entity];
		Array.prototype.push.apply(newArgs, args);
		/* jshint validthis: true */
		policyEditController.apply(this, newArgs);
	}

	eagleControllers.controller('policyPrototypesCtrl', function ($scope, $wrapState, Site, PageConfig, Entity, UI) {
		PageConfig.title = "Policy Prototypes";

		$scope.checkedPrototypes = {};

		function refreshPrototypeList() {
			$scope.prototypeList = Entity.query('policyProto');
		}

		$scope.deletePrototype = function (prototype) {
			UI.deleteConfirm(prototype.name)(function (entity, closeFunc) {
				Entity.delete("policyProto/" + prototype.uuid)._promise.then(function (res) {
					var data = res.data;

					if (data.success !== true) {
						$.dialog({
							title: 'OPS',
							content: data.message
						});
					}
				}).finally(function () {
					closeFunc();
					refreshPrototypeList();
				});
			});
		};

		$scope.getCheckedList = function () {
			return $.map($scope.prototypeList, function (proto) {
				return $scope.checkedPrototypes[proto.name] ? proto : null;
			});
		};

		$scope.doCheckAll = function () {
			if ($scope.getCheckedList().length === $scope.prototypeList.length) {
				$scope.checkedPrototypes = {};
			} else {
				$.each($scope.prototypeList, function (i, proto) {
					$scope.checkedPrototypes[proto.name] = true;
				});
			}
		};

		$scope.groupCreate = function () {
			var list = $scope.getCheckedList();
			$scope.createPolicy(list);
		};

		$scope.createPolicy = function (protoList) {
			if (protoList.length === 0) {
				$.dialog({
					title: 'OPS',
					content: 'Please select at least one prototype.',
				});
				return;
			}

			UI.createConfirm('Policy', {}, [
				{field: "siteId", name: "Site Id", type: 'select', valueList: $.map(Site.list, function (site) {
					return site.siteId;
				})}
			])(function (entity, closeFunc, unlock) {
				var nameList = $.map(protoList, function (proto) {
					return proto.name;
				});
				Entity.create("policyProto/exportByName/" + entity.siteId, nameList)._then(function (res) {
					var data = res.data;

					if(!data.success) {
						$.dialog({
							title: 'OPS',
							content: data.message
						});
						unlock();
						return;
					} else {
						$.dialog({
							title: 'Success',
							content: 'Click confirm to go to the policy page.',
							confirm: true,
						}, function (ret) {
							if (!ret) return;

							$wrapState.go('policyList', {siteId: entity.siteId });
						});
					}
					closeFunc();
				}, unlock);
			});
		};

		refreshPrototypeList();
	});

	eagleControllers.controller('policyCreateCtrl', function ($scope, $q, $wrapState, $timeout, PageConfig, Entity, Policy) {
		PageConfig.title = "Define Policy";
		connectPolicyEditController({}, arguments);
	});
	eagleControllers.controller('policyEditCtrl', function ($scope, $q, $wrapState, $timeout, PageConfig, Entity, Policy) {
		PageConfig.title = "Edit Policy";
		var args = arguments;

		$scope.policyList = Entity.queryMetadata("policies/" + encodeURIComponent($wrapState.param.name));
		$scope.policyList._promise.then(function () {
			var policy = $scope.policyList[0];

			if(policy) {
				connectPolicyEditController(policy, args);
			} else {
				$.dialog({
					title: "OPS",
					content: "Policy '" + $wrapState.param.name + "' not found!"
				}, function () {
					$wrapState.go("policyList");
				});
			}
		});
	});

	function policyEditController(policy, $scope, $q, $wrapState, $timeout, PageConfig, Entity, Policy) {
		$scope.policy = policy;
		$scope.policy = common.merge({
			name: "",
			description: "",
			inputStreams: [],
			outputStreams: [],
			definition: {
				type: "siddhi",
				value: ""
			},
			alertDefinition: {
				subject: "",
				body: "",
				severity: "WARNING",
				category: "DEFAULT"
			},
			alertDeduplications: [],
			partitionSpec: [],
			parallelismHint: 5
		}, $scope.policy);
		$scope.policy.siteId = $scope.policy.siteId || $wrapState.param.siteId;
		console.log("[Policy]", $scope.policy);

		var cacheSiteId;
		var cacheSearchSourceKey;
		var searchStreamGroups;

		$scope.searchSourceKey = "";
		$scope.streamGroups = {};
		$scope.newPolicy = !$scope.policy.name;
		$scope.autoPolicyDescription = $scope.newPolicy && !$scope.policy.description;
		$scope.savePrototype = false;

		PageConfig.navPath = [
			{title: "Policy List", path: "/policies"},
			{title: ($scope.newPolicy ? "Define" : "Update") + " Policy"}
		];

		// ==============================================================
		// =                             UI                             =
		// ==============================================================
		$scope.sourceTab = "all";
		$scope.setSourceTab = function (tab) {
			$scope.sourceTab = tab;
		};

		// ==============================================================
		// =                        Input Stream                        =
		// ==============================================================
		$scope.getSearchStreamGroups = function() {
			var siteId = $scope.policy.siteId;

			if(cacheSearchSourceKey !== $scope.searchSourceKey.toUpperCase() || cacheSiteId !== siteId) {
				var match = false;

				if (siteId) {
					cacheSearchSourceKey = $scope.searchSourceKey.toUpperCase();
					cacheSiteId = siteId;

					searchStreamGroups = {};
					$.each($scope.streamGroups, function (groupName, streams) {
						$.each(streams, function (i, stream) {
							if(
								stream.siteId === siteId && (
									groupName.toUpperCase().indexOf(cacheSearchSourceKey) >= 0 ||
									stream.streamId.toUpperCase().indexOf(cacheSearchSourceKey) >= 0
								)
							) {
								match = true;
								var group = searchStreamGroups[groupName] = searchStreamGroups[groupName] || [];
								group.push(stream);
							}
						});
					});
				}

				if(!match) {
					searchStreamGroups = null;
				}
			}
			return searchStreamGroups;
		};

		$scope.streams = {};
		$scope.streamList = Entity.queryMetadata("streams");
		$scope.streamList._then(function () {
			$scope.streamGroups = {};
			cacheSearchSourceKey = null;

			$.each($scope.streamList, function (i, stream) {
				var streamGroup = stream.group || 'Global';
				var list = $scope.streamGroups[streamGroup] = $scope.streamGroups[streamGroup] || [];
				list.push(stream);
				$scope.streams[stream.streamId] = stream;
			});
		});

		$scope.isInputStreamSelected = function (streamId) {
			return $.inArray(streamId, $scope.policy.inputStreams) >= 0;
		};

		/*$scope.checkInputStream = function (streamId) {
			if($scope.isInputStreamSelected(streamId)) {
				$scope.policy.inputStreams = common.array.remove(streamId, $scope.policy.inputStreams);
			} else {
				$scope.policy.inputStreams.push(streamId);
			}
		};*/

		// ==============================================================
		// =                         Definition                         =
		// ==============================================================
		function autoDescription() {
			if(!$scope.autoPolicyDescription) return;

			$scope.policy.description = "Policy for " + $scope.policy.outputStreams.join(", ");
		}

		var checkPromise;
		$scope.definition = {};
		$scope.definitionMessage = "";
		$scope.checkDefinition = function (keepDefinition) {
			$timeout.cancel(checkPromise);
			checkPromise = $timeout(function () {
				Entity.post("metadata/policies/parse", $scope.policy.definition.value)._then(function (res) {
					var data = res.data;
					console.log(data);
					if(data.success) {
						$scope.definition = {};
						$scope.definitionMessage = "";

						if(data.policyExecutionPlan) {
							$scope.definition = data;

							// Input streams
							var inputStreams = $.map(data.policyExecutionPlan.inputStreams, function (value, stream) {
								return stream;
							});

							// Output streams
							var outputStreams = $.map(data.policyExecutionPlan.outputStreams, function (value, stream) {
								return stream;
							});

							// Partition
							if (keepDefinition !== true) {
								$scope.policy.partitionSpec = $.grep(data.policyExecutionPlan.streamPartitions, function (partition) {
									return $.inArray(partition.streamId, outputStreams) === -1;
								});
							}

							var tempStreams = $.grep(inputStreams, function (i) {
								return $.inArray(i, outputStreams) > -1;
							});

							$.each(tempStreams, function (i, tempStream) {
								inputStreams = common.array.remove(tempStream, inputStreams);
								outputStreams = common.array.remove(tempStream, outputStreams);
							});

							if (keepDefinition !== true) {
								$scope.policy.outputStreams = outputStreams.concat();
								$scope.policy.inputStreams = inputStreams;
							}
							$scope.outputStreams = outputStreams;
							autoDescription();

							// Dedup fields
							if (keepDefinition !== true) {
								$scope.refreshOutputSteamFields();
							}
						}
					} else {
						$scope.definition = {};
						$scope.definitionMessage = data.message;
					}
				});
			}, 350);
		};

		$scope.checkDefinition(true);

		// ==============================================================
		// =                        Output Stream                       =
		// ==============================================================
		$scope.outputStreams = ($scope.policy.outputStreams || []).concat();

		// Select output stream
		$scope.isOutputStreamSelected = function (streamId) {
			return $.inArray(streamId, $scope.policy.outputStreams) >= 0;
		};

		$scope.checkOutputStream = function (streamId) {
			if($scope.isOutputStreamSelected(streamId)) {
				$scope.policy.outputStreams = common.array.remove(streamId, $scope.policy.outputStreams);
			} else {
				$scope.policy.outputStreams.push(streamId);
			}
			autoDescription();

			$scope.refreshOutputSteamFields();
		};

		// Select output steam field
		$scope.refreshOutputSteamFields = function () {
			var defOutputStreams = common.getValueByPath($scope.definition || {}, 'policyExecutionPlan.outputStreams');
			if (!defOutputStreams) return [];

			$scope.policy.alertDeduplications = $.map($scope.policy.outputStreams, function (outputStream) {
				return {
					outputStreamId: outputStream,
					dedupIntervalMin: '30',
					dedupFields: [],
				};
			});
		};
		$scope.getOutputStreamFields = function (outputStream) {
			var defOutputStreams = common.getValueByPath($scope.definition || {}, 'policyExecutionPlan.outputStreams');
			if (!defOutputStreams) return [];

			var fields = defOutputStreams[outputStream];
			return $.map(fields, function (field) {
				return field.name;
			});
		};

		$scope.isDedupFieldSelected = function (outputStreamDedup, field) {
			return $.inArray(field, outputStreamDedup.dedupFields) >= 0;
		};

		$scope.checkDedupField = function (outputStreamDedup, field) {
			if($scope.isDedupFieldSelected(field)) {
				outputStreamDedup.dedupFields = common.array.remove(field, outputStreamDedup.dedupFields);
			} else {
				outputStreamDedup.dedupFields.push(field);
			}
		};

		// ==============================================================
		// =                         Partition                          =
		// ==============================================================
		$scope.partition = {};

		$scope.addPartition = function () {
			$scope.partition = {
				streamId: $scope.policy.inputStreams[0],
				type: "GROUPBY",
				columns: []
			};
			$(".modal[data-id='partitionMDL']").modal();
		};

		$scope.newPartitionCheckColumn = function (column) {
			return $.inArray(column, $scope.partition.columns) >= 0;
		};

		$scope.newPartitionClickColumn = function (column) {
			if($scope.newPartitionCheckColumn(column)) {
				$scope.partition.columns = common.array.remove(column, $scope.partition.columns);
			} else {
				$scope.partition.columns.push(column);
			}
		};

		$scope.addPartitionConfirm = function () {
			$scope.policy.partitionSpec.push($scope.partition);
		};

		$scope.removePartition = function (partition) {
			$scope.policy.partitionSpec = common.array.remove(partition, $scope.policy.partitionSpec);
		};

		// ==============================================================
		// =                         Publisher                          =
		// ==============================================================
		$scope.publisherList = Entity.queryMetadata("publishments");
		$scope.addPublisherType = "";
		$scope.policyPublisherList = [];
		$scope.publisher = {};

		if(!$scope.newPolicy) {
			Entity.queryMetadata("policies/" + $scope.policy.name + "/publishments/")._then(function (res) {
				$scope.policyPublisherList = $.map(res.data, function (publisher) {
					return $.extend({
						_exist: true
					}, publisher);
				});
			});
		}

		$scope.addPublisher = function () {
			$scope.publisher = {
				existPublisher: $scope.publisherList[0],
				type: "org.apache.eagle.alert.engine.publisher.impl.AlertEmailPublisher",
				serializer : "org.apache.eagle.alert.engine.publisher.impl.StringEventSerializer",
				properties: {}
			};
			if($scope.publisherList.length) {
				$scope.addPublisherType = "exist";
			} else {
				$scope.addPublisherType = "new";
			}

			$.each(Policy.publisherTypeList, function (i, publisherType) {
				$.each(publisherType.fields, function (j, field) {
					if(field.value) $scope.publisher.properties[field.name] = field.value;
				});
			});

			$(".modal[data-id='publisherMDL']").modal();
		};

		$scope.removePublisher = function (publisher) {
			$scope.policyPublisherList = common.array.remove(publisher, $scope.policyPublisherList);
		};

		$scope.checkPublisherName = function () {
			if(common.array.find($scope.publisher.name, $scope.publisherList.concat($scope.policyPublisherList), ["name"])) {
				return "'" + $scope.publisher.name + "' already exist";
			}
			return false;
		};


		$scope.checkPolicyName = function () {
			if($scope.policy.name.length > 50) {
				return "length should less than 50";
			}
			return false;
		};


		$scope.addPublisherConfirm = function () {
			if($scope.addPublisherType === "exist") {
				$scope.publisher = $.extend({
					_exist: true
				}, $scope.publisher.existPublisher);
			}
			var properties = {};
			$.each(Policy.publisherTypes[$scope.publisher.type].fields, function (i, field) {
				properties[field.name] = $scope.publisher.properties[field.name] || "";
			});
			$scope.policyPublisherList.push($.extend({}, $scope.publisher, {properties: properties}));
		};

		// ==============================================================
		// =                            Save                            =
		// ==============================================================
		$scope.saveLock = false;
		$scope.saveCheck = function () {
			return (
				!$scope.saveLock &&
				$scope.policy.name &&
				!$scope.checkPolicyName() &&
				common.number.parse($scope.policy.parallelismHint) > 0 &&
				$scope.policy.siteId &&
				$scope.policy.definition.value &&
				$scope.policy.outputStreams.length &&
				$scope.policyPublisherList.length
			);
		};

		$scope.saveConfirm = function () {
			$scope.saveLock = true;

			// Check policy
			Entity.post("metadata/policies/validate", $scope.policy)._then(function (res) {
				var validate = res.data;
				console.log(validate);
				if(!validate.success) {
					$.dialog({
						title: "OPS",
						content: validate.message
					});
					$scope.saveLock = false;
					return;
				}

				// Create publisher
				var publisherPromiseList = $.map($scope.policyPublisherList, function (publisher) {
					if(publisher._exist) return;

					return Entity.create("metadata/publishments", publisher)._promise;
				});
				if(publisherPromiseList.length) console.log("Creating publishers...", $scope.policyPublisherList);

				$q.all(publisherPromiseList).then(function () {
					console.log("Create publishers success...");

					var publisherNameList = $.map($scope.policyPublisherList, function (publisher) {
						return publisher.name;
					});

					var policyPromise;

					if ($scope.savePrototype) {
						policyPromise = Entity.create('policyProto/create?needPolicyProtoCreated=true', {
							definition: $scope.policy,
							alertPublishmentIds: publisherNameList
						});
					} else {
						policyPromise = Entity.create('policyProto/create?needPolicyProtoCreated=false', {
							definition: $scope.policy,
							alertPublishmentIds: publisherNameList
						});
					}

					policyPromise._then(function () {
						console.log("Create policy success...");
						$.dialog({
							title: "Done",
							content: "Close dialog to go to the policy detail page."
						}, function () {
							$wrapState.go("policyDetail", {name: $scope.policy.name, siteId: $scope.policy.siteId});
						});
					}, function (res) {
						var errormsg = "";
						if(typeof res.data.message !== 'undefined') {
							errormsg = res.data.message;
						} else {
							errormsg = res.data.errors;
						}
						$.dialog({
							title: "OPS",
							content: "Create policy failed: " + errormsg
						});
						$scope.policyLock = false;
					});
				}, function (args) {
					$.dialog({
						title: "OPS",
						content: "Create publisher failed. More detail please check output in 'console'."
					});
					console.log("Create publishers failed:", args);
					$scope.policyLock = false;
				});
			}, function () {
				$scope.saveLock = false;
			});
		};
	}
})();
