# *** Work in Progress ***
# Build and Deploy a hello-world application on Kubernetes

These days industries are adopting container enabled environments like Docker and Kubernetes. Generally developers create applications on their desktop, debug them locally, and then build and deploy to the container environment. This tutorial helps you to understand the steps involved to deploy an application to Kubernetes Service on IBM Cloud. At the end of this tutorial, you will learn how to build and deploy an application on IBM Cloud Kubernetes Service :
-	using kubectl CLI without any devops pipeline
-	using Tekton (Kubernetes style CI/CD) Pipeline 

## Pre-requisites

To complete this tutorial, you need:

* An [IBM Cloud](https://cloud.ibm.com/login) account
* Get an instance of [Kubernetes Service on IBM Cloud](https://cloud.ibm.com/kubernetes/catalog/cluster). It will take ~20 minutes.
* Get the access of Kubernetes Cluster through `kubectl` CLI using the instructions provided in access tab at:
  ```
  IBM Cloud Dashboard -> <your cluster> -> Access Tab
  ```
* Create (if not already) namespace on IBM Cloud container registry. It can be accessed at:
  ```
  IBM Cloud Dashboard -> Click on Navigation Menu -> Kubernetes -> Registry -> Namespaces
  ```
* Configure [Git CLI](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git). Clone the repository using the command below:
  ```
  git clone https://github.com/IBM/deploy-app-using-tekton-on-kubernetes.git
  ```
  
  > Note: You should clone this repository to your workstation since you need to edit some of the files before using them.
  
## Estimated Time
This tutorial takes about 40 minutes, after pre-requisites configuration.

## Section 1 - To build and deploy an application on IBM Cloud Kubernetes Service using kubectl

Once the coding of your application is completed, the following are the steps which we perform usually to build and deploy an application on Kubernetes cluster. 
-	Package the app into Docker container image - Write a Dockerfile for your app and build the container image using Dockerfile
-	Upload the built container image to the accessible container registry
-	Create a Kubernetes deployment using the container image and deploy the application to an IBM Cloud Kubernetes Service cluster using configuration(yaml) files. The configuration files contain instructions to deploy the container image of application in Pod and then expose it as a service to access through API

The Dockerfile and deployment configuration file is already available in git repository at `~/src`. The steps explained in this section guide you to deploy your application to cluster using CLIs.

**Setup deploy target**

As a first step, you need to set the correct deploy target for the container image to upload to the accessible container registry. Depending on the region you have created your cluster in, your image URL will be in the following format:
```
  <REGION_ABBREVIATION>.icr.io/<YOUR_NAMESPACE>/<YOUR_IMAGE_NAME>:<VERSION>
```

The following command tells you the Registry API endpoint for your cluster. You can get region abbreviation from the output.
```
   ibmcloud cr api
```
To get namespace use the following command:
```
   ibmcloud cr namespaces
```
For example, deploy target for US-South region will be:
```
   us.icr.io/namespace-name/image-name:image-tag
```

**Deploy the application**

Run the following commands to deploy application on Kubernetes cluster.

```
  cd <downloaded-source-code-repository>/src
  
  # Build and push it to IBM Cloud Container registry. Following command takes care of build and push to container registry and eliminates the overhead to run docker commands individually.
  ibmcloud cr build -t us.icr.io/test_namespace/builtApp:1.0 .
  
  # Verify whether the image is uploaded to the container registry
  ibmcloud cr images 
  
  # Update deploy target in deploy.yaml
  sed -i '' s#IMAGE#us.icr.io/test_namespace/builtApp:1.0# deploy.yaml
  
  # Run deploy configuration
  kubectl create -f deploy.yaml 
  
  # Verify output - pod and service should be up and running
  kubectl get pods
  kubectl get service
```

Get the public IP of Kubernetes Cluster on IBM Cloud and access the application on 32426 port as this port is used in deploy.yaml.
```
  http://<public-ip-of kubernetes-cluster>:32426/
```

This way application gets deployed on Kubernetes Cluster using CLIs. If you make more changes in application after deploy, then you have to re-run the steps again. In order to build, test, and deploy application faster and more reliably, need to automate the entire workflow. We should follow the modern development practices that is continuous integration and delivery (CI/CD) as it reduces the overhead of development and deployment process and saves significant time and effort. The next section of this tutorial explains the build and deploy approach using Tekton Pipelines.

## Section 2 - To build and deploy an application on IBM Cloud Kubernetes Service using Tekton Pipeline

[Tekton](https://github.com/tektoncd/pipeline) is a powerful and flexible Kubernetes-native open-source framework for creating CI/CD systems. It allows you build, test, and deploy across multiple cloud providers or on-premises systems by abstracting away the underlying implementation details. The high level concept of Tekton Pipeline can be explained as below.

The Tekton Pipeline project extends the Kubernetes API by five additional custom resource definitions (CRDs) to define pipelines:
* Task - Task describes individual jobs and defines a set of build steps such as compiling code, running tests, and building and deploying images.
* Taskrun - A Taskrun runs the task you defined. With taskrun it is possible to execute a single task, which binds the inputs and outputs of the task.
* Pipeline - Pipeline describes a list of tasks that compose a pipeline.
* Pipelinerun - Pipelinerun defines the execution of a pipeline. It references the Pipeline to run and which PipelineResource(s) to use as input and output.
* Pipelineresource - It defines an object that is an input (such as a Git repository) or an output (such as a Docker image) of the pipeline.

Following are the steps required to automate the application’s workflow for build and deploy using Tekton Pipelines.

**Add the Tekton Pipelines component to your Kubernetes cluster**

As a very first step, add the tekton pipelines to your Kubernetes cluster using following command.

```
  kubectl apply --filename https://storage.googleapis.com/tekton-releases/latest/release.yaml
```

The installation creates two pods which can be checked using the following command and wait until pods are in running state. 
```
  kubectl get pods --namespace tekton-pipelines
```

For more information on this, refer [here](https://github.com/tektoncd/pipeline/blob/master/docs/install.md#adding-the-tekton-pipelines). With this your kubernetes cluster is ready to run Tekton Pipelines. Let’s start creating the definition of custom resources.

**Create Pipeline Resource**

In the example taken for this tutorial, the source code of the application, Dockerfile and deployment configuration is available in github repository at `~/src`. Hence, need to create the input pipeline resource to access the git repository. To define PipelineResource for git repository, we configure:
* Resource `type` as git
* Provide git repository URL as `url`
* `revision` as name of the branch of the git repository to be used

The complete YAML file is available at `~/tekton-pipeline/resources/git.yaml`. Apply the file to the cluster as shown.

```
  cd ~/tekton-pipeline
  kubectl apply -f resources/git.yaml
```

**Create Tasks**

Task defines the steps of the pipeline. To deploy an application to cluster using source code in git repository, we define two tasks - `build-image-from-source` and `deploy-to-cluster`. In task defintion the parameters used as args are referred as `$(inputs.params.<var_name>)`.

*Build-image-from-source*

This task includes two steps as follows:

* `list-src` step lists the source code from cloned repository. It is being done just to verify whether source code is cloned properly.

* `build-and-push` step builds the container image using Dockerfile and pushes the built image to the container registry. In this example `Kaniko` is used to build and push the image. There are other options also available for this purpose like buildah, podman etc. Kaniko uses the Dockerfile name, its location and destination to upload the container image as arguments.

All required parameters are passed through params. Apply the file to the cluster using following command.

```
  kubectl apply -f task/build-src-code.yaml
```

*Deploy-to-cluster*

Deploy an application on Kubernetes Service means deploy application in pod using the built container image and make it available as a service to access from anywhere. This task uses the deployment configuration located as `~/src/deploy.yaml`. This task includes two steps:

* `update-yaml` step updates the container image url in place of `IMAGE` in deploy.yaml.

* `deploy-app` step deploys the application in Kubernetes pod and expose it as a service using `~/src/deploy.yaml`. This step uses `kubectl` to create deployment configuration on Kubernetes cluster.
 
All required parameters are passed through params.

Apply the file to the cluster as: 

```
  kubectl apply -f task/deploy-to-cluster.yaml
```

**Create Pipeline**

Pipeline lists the tasks to be executed and provides the input and output resources and input parameters required by each task. If there is any dependency between the tasks, that is also addressed. In the `tekton-pipeline/resources/pipeline.yaml` :

* Pipeline uses the above mentioned tasks `build-image-from-source` and `deploy-to-cluster`
* Need to execute the tasks one after the another, hence `runAfter` key is used.
* Pipelineresource (git repository) is provided through the `resources` key.

All required parameters are passed through params. Parameters value are defined in pipeline as `$(params.imageUrl)` which is different than the args in task definition. Apply this configuration as:

```
  kubectl apply -f pipeline/pipeline.yaml
```

**Create PipelineRun**

To execute the pipeline we need a PipelineRun resource definition. All required parameters will be passed from PipelineRun. PipelineRun will trigger Pipeline, further Pipeline will create TaskRuns and so on. In the similar manner parameters gets substituted to the corresponding task. If a parameter is not defined in PipelineRun, then the default value gets picked-up from the `params` under `spec` from the resource definition itself. For example, `pathToDockerfile` param is used in task `build-image-from-source` but its value is not provided in `pipeline-run.yaml`, so its default value defined in `~/tekton-pipeline/build-src-code.yaml` will be used during the task execution.

In PipelineRun definition `tekton-pipeline/pipeline/pipeline-run.yaml`:

* It references the Pipeline `application-pipeline` created through `pipeline.yaml`.
* It references the PipelineResource `git` to use as input.
* It provides the value of parameters under `params` which are required during the execution of pipeline and the tasks.
* A service account is specified.

The important point to note here is that through pipeline we push images to registry and deploying into cluster, so we need to ensure that it has the sufficient and all required permissions to access container registry and the cluster. The credentials for the registry will be provided by a ServiceAccount. Hence, let us define a service account before executing Pipelinerun.

> Note: Do not apply the PipelineRun file yet because you still need to define the service account for it.

**Create Service Account**

To access the protected resources, need to setup a service account which uses secrets to create or modify Kubernetes resources. IBM Cloud Kubernetes Service is configured to use IBM Cloud Identity and Access Management (IAM) roles. These roles determine the actions that users can perform on IBM Cloud Kubernetes. 

*Generate API Key*

To generate API key using IBM Cloud Dashboard, follow the instructions given [here](https://cloud.ibm.com/docs/iam?topic=iam-userapikey#create_user_key). Else, use the following CLI command to create API key.

```
  ibmcloud iam api-key-create MyKey -d "this is my API key" --file key_file.json
  cat key_file.json | grep apikey
```

Copy the `apikey`, it will be used in the next step.

*Create Secret* 

```
  kubectl create secret generic ibm-cr-secret --type="kubernetes.io/basic-auth" --from-literal=username=iamapikey --from-literal=password=<APIKEY>

  kubectl annotate secret ibm-cr-secret tekton.dev/docker-0=<REGISTRY>
```

where,
* < APIKEY > is the one that you created
* < REGISTRY > is the registry API endpoint for your cluster, for example us.icr.io 

It creates a secret named as `ibm-cr-secret` which will be used in configuration file for service account.

In the configuration file `tekton-pipeline/pipeline/service-account.yaml`:

* serviceaccount resource uses the secret generated above `ibm-cr-secret`.
* As per the definition of Secret resource, the newly built secret is populated with an API token for the service account. 
* The next step is to define roles. A Role can only be used to grant access to resources within a single namespace. Need to include appropriate resources and apiGroups in rules otherwise it fails with access issues.
* A role binding grants the permissions defined in a role to a user or set of users. It holds a list of subjects (users, groups, or service accounts), and a reference to the role being granted. 

Apply this configuration as:

```
  kubectl apply -f pipeline/service-account.yaml
```
**Execute the Pipeline**

Before executing Pipelinerun, modify `imageUrl` and `imageTag` in `tekton-pipeline/pipeline/pipelinerun.yaml`. Refer `Setup Deploy Target` section above to decide on image URL and tag. If imageURL is *us.icr.io/test_namespace/builtApp* and image tag is *latest*, then update configuration file as:

```
  sed -i '' s#IMAGE_URL#us.icr.io/test_namespace/builtApp# pipeline/pipelinerun.yaml
  sed -i '' s#IMAGE_TAG#latest# pipeline/pipelinerun.yaml
```

Now, create the pipelinerun configuration.

```
  kubectl create -f pipeline/pipeline-run.yaml
```

It will create pipeline and you will get message on terminal as:
```
  pipelinerun.tekton.dev/application-pipeline-run created
```

To check the status of the pipeline created,
```
  kubectl describe pipelinerun application-pipeline-run
```

You may need to re-run this command till pipeline execution is not completed. It should show the interim status as:

<pre>
Status:
  Conditions:
    Last Transition Time:  2019-11-11T06:51:06Z
    Message:               <b>Not all Tasks in the Pipeline have finished executing</b>
    Reason:                Running
    Status:                Unknown
    Type:                  Succeeded
  
   ...
   ...
   Events:              <none>
</pre>

Once the execution of pipeline is completed, you should see the following as an output of describe command:

<pre>
Status:
  Completion Time:  2019-11-07T09:41:59Z
  Conditions:
    Last Transition Time:  2019-11-07T09:41:59Z
    Message:               <b>All Tasks have completed executing</b>
    Reason:                Succeeded
    Status:                True
    Type:                  Succeeded
..
..
Events:
  Type     Reason             Age                From                 Message
  ----     ------             ----               ----                 -------
  Normal   Succeeded          0s                 pipeline-controller  <b>All Tasks have completed executing</b>
</pre>

If it fails, then it shows which task has been failed and also give you more details to check logs. To know more details about a resource say pipeline then use `kubectl describe` command to get more details.

```
  kubectl describe <resource> <resource-name>
```

**Verify Result**

To verify whether pod and service is running as expected, check the output of the following commands.

<pre>
  <b>kubectl get pods</b>
  # Output should be something like this
    NAME                                                                READY   STATUS      RESTARTS   AGE
    app-59dff7b655-7ggbt                                                1/1     Running     0          81s
    application-pipeline-run-build-image-from-source-2m62g-pod-f4eb96   0/3     Completed   0          119s
    application-pipeline-run-deploy-application-kg2jm-pod-89f884        0/3     Completed   0          89s

  <b>kubectl get service</b>
  # Output 
    NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE
    app          NodePort    xxx.xx.xx.xxx   <none>        3300:32426/TCP   4m51s

</pre>

Get the public IP of Kubernetes Cluster on IBM Cloud and access the application on 32426 port as this port is used in deploy.yaml.
```
  http://<public-ip-of kubernetes-cluster>:32426/
```

In this way you deploy your application using Tekton Pipeline. This tutorial covers the basics of Tekton Pipeline to get you started building your own pipelines. There are more features available like webhooks, web based dashboards and more. Do try it out with IBM Cloud Kubernetes Service.

## Next Steps

Tekton is one of the tools available in open source project Kabanero. [Kabanero](https://kabanero.io/) brings together key technologies into a microservices-based framework for building modern cloud-native applications. Kabanero has Codewind which helps to build cloud-native applications, Appsody which helps to build and deploy cloud-native applications and Tekton which is Kubernetes style CI/CD pipeline. Each project has its own open source community and independent releases. The Kabanero open source project is included within [IBM Cloud Pak for Applications](https://cloud.ibm.com/catalog/content/ibm-cp-applications) as Kabanero Enterprise. Cloud Pak for Applications provides a faster, more secure way to move your business applications to cloud, in container enabled environment. Cloud Pak for Applications is built and supported on Red Hat OpenShift. Explore and try out with the help of this [developer guide](https://developer.ibm.com/series/developers-guide-to-ibm-cloud-pak-for-applications/).


## Related Links
* [Tekton Pipelines](https://github.com/tektoncd/pipeline#-tekton-pipelines)
* [Deploy a Knative application using Tekton-Pipelines](https://developer.ibm.com/tutorials/knative-build-app-development-with-tekton/)
* [Codewind + Appsody + Tekton = Easier Cloud-Native Development](https://www.ibm.com/cloud/blog/codewind-appsody-tekton-means-easier-cloud-native-development)
* [Kabanero: Development tools and runtimes powering IBM Cloud Pak for Applications](https://www.ibm.com/cloud/blog/kabanero-microservices-cloud-native-apps-faster)
* [Codewind Tutorial](https://developer.ibm.com/tutorials/develop-a-cloud-native-java-application-using-codewind/)
* [Appsody Overview](https://developer.ibm.com/articles/customizing-appsody/)





