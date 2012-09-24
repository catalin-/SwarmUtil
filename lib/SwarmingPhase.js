var util = require("swarmutil");

function SwarmingPhase(swarmingName, phase) {
    var meta        = thisAdapter.compiledSwarmingDescriptions[swarmingName].meta;
    var initVars    = thisAdapter.compiledSwarmingDescriptions[swarmingName].vars;

    this.meta = new Object();
    if(meta != undefined){
        for (var i in meta) {
            this.meta[i] = meta[i];
        }
    }

    if(initVars != undefined){
        for (var i in initVars) {
            this[i] = initVars[i];
        }
    }

    this.meta.swarmingName = swarmingName;
    this.meta.currentPhase = phase;

    if(this.meta.debug == true){
        cprint("New META: " + J(this) );
    }
}


SwarmingPhase.prototype.swarm = function (phaseName, nodeHint ) {
    if(thisAdapter.readyForSwarm != true){
        cprint("Asynchronicity issue: Redis connection is not ready for swarming " + phaseName);
        return;
    }
    try{
        if(thisAdapter.compiledSwarmingDescriptions[this.meta.swarmingName] == undefined){
            logErr("Undefined swarm " + this.meta.swarmingName);
            return;
        }

        this.meta.currentPhase = phaseName;
        var targetNodeName = nodeHint;
        if (nodeHint == undefined) {
            var phase = thisAdapter.compiledSwarmingDescriptions[this.meta.swarmingName][phaseName];
            if(phase == undefined){
                logErr("Undefined phase " + phaseName + " in swarm " + this.meta.swarmingName);
                return;
            }
            targetNodeName = phase.node;
        }

        if(this.meta.debug == true){
            dprint("Starting swarm "+this.meta.swarmingName +  " towards " + targetNodeName + ", Phase: "+ phaseName);
        }

        if(targetNodeName != undefined){
            publishSwarm(targetNodeName,this,function (err,res){
                if(err != null){
                    logErr(err.message,err);
                }
            });
        }
        else{
            logInfo("Unknown phase " + phaseName);
        }
    }
    catch(err) {
        logErr("Unknown error in phase {" + phaseName + "} nodeHint is {" + targetNodeName +"} Dump: " + J(thisAdapter.compiledSwarmingDescriptions[this.swarmingName]),err);
    }
};


SwarmingPhase.prototype.sendFail = function() {
    var phase = this.meta.onError;
    if( phase != undefined){
        this.swarm(phase,this.meta.confirmationNode);
    }
}


SwarmingPhase.prototype.safeSwarm = function (phaseName, nodeHint,timeOut,retryTimes,persistent) {
    if(timeOut == undefined ){
        timeOut = 300;
    }
    if(retryTimes == undefined){
        retryTimes = 0;
    }
    this.meta.phaseExecutionId = generateUID();
    this.meta.confirmationNode = thisAdapter.nodeName;
    this.meta.pleaseConfirm = true;

    setTimeout(function(){
        beginExecutionContext(this);
        var ctxt = getContext(this.meta.phaseExecutionId);
        cprint(J(ctxt) + J(this));
        if(ctxt.confirmedExecution == true){
            var phase = this.meta.onSucces;
            if( phase != undefined){
                this.swarm(phase,this.meta.confirmationNode);

            }
            removeContext(this.meta.phaseExecutionId);
        }
        else{
            if(retryTimes == 0){
                this.confirmFail();
            }else{
                this.safeSwarm(phaseName, timeOut,nodeHint,retryTimes-1,save);
            }
        }
        endExecutionContext();
    }.bind(this), timeOut);

    this.swarm(phaseName,nodeHint);
}

SwarmingPhase.prototype.deleteTimeoutSwarm = function (timerRef) {
    //cleanTimeout(timerRef);
}

SwarmingPhase.prototype.timeoutSwarm = function (timeOut,phaseName, nodeHint) {
    var timeoutId = -1;
    try{
        var targetNodeName = nodeHint;
        if (nodeHint == undefined) {
            targetNodeName = thisAdapter.compiledSwarmingDescriptions[this.swarmingName][phaseName].node;
        }
        if(nodeHint == thisAdapter.nodeName ){
            var callBack =  thisAdapter.compiledSwarmingDescriptions[this.swarmingName][phaseName].code;
            if(typeof callBack == "function"){
                timeoutId = setTimeout(callBack.bind(this),timeOut);
            }else{
                logErr("Failed in setting timeout in swarm " + this.meta.swarmingName + " because " +phaseName + " is not a phase", err);
            }
        }else{
            timeoutId = setTimeout(function (){
                this.swarm(phaseName,nodeHint);
            }.bind(this),timeOut);
        }
    }
    catch(err){
        logErr("Failed in setting timeout in swarm " + this.swarmingName, err);
    }
    return timeoutId;
}


exports.newSwarmPhase = function(swarmingName, phase){
    return new SwarmingPhase(swarmingName, phase);
}

SwarmingPhase.prototype.currentSession = function(){
    return this.meta.sessionId;
}

SwarmingPhase.prototype.getSessionId = SwarmingPhase.prototype.currentSession;

SwarmingPhase.prototype.setSessionId = function(session){
    this.meta.sessionId = session;
}


SwarmingPhase.prototype.getTenantId = function(){
    return this.meta.tenantId;
}

SwarmingPhase.prototype.setTenantId = function(tenant){
    this.meta.tenantId = tenant;
}

function consumeSwarm(channel,swarm,funct){
    return function(){
        try{
            util.adapter.onMessageFromQueueCallBack(swarm);
            funct(null,null);
        }
        catch(err){
            funct(err,null);
        }
    }
}

function publishSwarm(channel,swarm,funct){
    if(channel[0] == "#"){
        //local channel, just execute
        process.nextTick(consumeSwarm(channel,swarm,funct))
    }
    else{
        redisClient.publish(util.mkChannelUri(channel), J(swarm),funct);
    }
}


/* alternative implementation for local nodes
 var queue = new Array();

 function consumeSwarm(){
 var rec = queue.shift();
 swarm = rec.swarm;
 try{
 onMessageFromQueue(swarm);
 rec.funct(null,null);
 }
 catch(err){
 rec.funct(err,null);
 }
 }


 function publishSwarm(channel,swarm,funct){
 if(channel[0] == "#"){
 //local channel, just execute
 queue.push({"channel":channel,"swarm":swarm,"funct":funct});
 process.nextTick(consumeSwarm) ;
 }
 else{
 redisClient.publish(thisAdapter.coreId+channel, J(swarm),funct);
 }
 } */
