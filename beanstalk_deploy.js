'use strict'

let AWS = require('aws-sdk')
let config = require('./config.json')
AWS.config.loadFromPath('./credentials.json');
let fs = require('fs')
let s3 = new AWS.S3();
let elasticbeanstalk = new AWS.ElasticBeanstalk();

const S3_ERROR_ALREADY_EXIST_BUCKET = "BucketAlreadyOwnedByYou"; //버킷이 존재할때 발생하는 오류
const CURRENT_DATETIME = new Date().toISOString().replace(/-|:|\.|T|Z/g, ''); //파일명 중복방지
const ZIP_FILE = __dirname+'/dist/app.zip'; // bitbucket-pipelines.yml에 있는 zip 명령어의 경로와 일치해야한다.

const configWrapper = {
    S3: {
        BUCKET: config.s3.bucket,
        KEY: CURRENT_DATETIME + '-' + config.s3.key
    },
    BEANSTALK: {
        APPLICATION_NAME: config.beanstalk.application_name,
        ENVIRONMENT_NAME: config.beanstalk.environment_name,
        VERSION_LABEL: config.beanstalk.version_label + '-' + CURRENT_DATETIME,
        DESCRIPTION: config.beanstalk.description
    }

}

function create_s3() {
    return new Promise((resolve, reject) => {
        s3.createBucket({Bucket: configWrapper.S3.BUCKET}, (err, data) => {
            if (err) {
                reject(err)
            } else {
                console.log("Successfully created bucket " + configWrapper.S3.BUCKET);
                resolve(data)
            }
        })

    })
}

function upload_to_s3() {
    let params = {
        Bucket: configWrapper.S3.BUCKET,
        Key: configWrapper.S3.KEY,
        Body: fs.readFileSync(ZIP_FILE),
    };

    return new Promise((resolve, reject) => {
        create_s3().catch((err) => {
            if (err.code == S3_ERROR_ALREADY_EXIST_BUCKET) {
                return null;
            } else {
                reject(err);
            }
        }).then(() => {
            s3.putObject(params, function (err, data) {
                if (err) {
                    reject(err);
                } else {
                    console.log("Successfully uploaded data to " + configWrapper.S3.BUCKET + "/" + configWrapper.S3.KEY);
                    resolve(data);
                }
            })
        })

    })

}

function create_new_version() {

    let params = {
        ApplicationName: configWrapper.BEANSTALK.APPLICATION_NAME,
        VersionLabel: configWrapper.BEANSTALK.VERSION_LABEL,
        Description: configWrapper.BEANSTALK.DESCRIPTION,
        SourceBundle: {
            S3Bucket: configWrapper.S3.BUCKET,
            S3Key: configWrapper.S3.KEY
        },
        Process: true

    };

    return new Promise((resolve, reject) => {
        elasticbeanstalk.createApplicationVersion(params, function (err, data) {
            if (err) {
                reject(err)
            } else {
                console.log("Successfully create new version " + configWrapper.BEANSTALK.VERSION_LABEL);
                resolve(data)
            }
        })
    });


}

function deploy_new_version() {

    let params = {
        EnvironmentName: configWrapper.BEANSTALK.ENVIRONMENT_NAME,
        ApplicationName: configWrapper.BEANSTALK.APPLICATION_NAME,
        VersionLabel: configWrapper.BEANSTALK.VERSION_LABEL,
    }
    return new Promise((resolve, reject) => {

        elasticbeanstalk.updateEnvironment(params, function (err, data) {
            if (err) {
                reject(err)
            } else {
                console.log("Successfully deploy new version " + configWrapper.BEANSTALK.VERSION_LABEL + " to " + configWrapper.BEANSTALK.APPLICATION_NAME + " / " + configWrapper.BEANSTALK.ENVIRONMENT_NAME);
                resolve(data)
            }
        })
    });
}

function sleepForCreatingNewVersion() {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(null)
        }, 5000)
    })
}

function main() {
    upload_to_s3().then(() => {
        return create_new_version()
    }).then(() => {
        return sleepForCreatingNewVersion()
    }).then(() => {
        return deploy_new_version()
    }).then(() => {
        console.log('Done!!!')
    }).catch((err) => {
        console.log('Error!!!')
        console.log(err);
    })

}

main();
