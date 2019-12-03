
# Build and deploy a hello-world application on Kubernetes

Container-based software development is growing. Since it's easy to replicate the environment, developers generally create applications on their desktop, and debug and test them locally. Later they build and deploy the application to a Kubernetes cluster. 

In this tutorial, I show you how two ways to deploy an application to a Kubernetes cluster on IBM Cloud:
- Using a `kubectl` CLI without a DevOps pipeline
- Using a Tekton pipeline (which is Kubernetes-style continuous integration/continuous delivery pipeline)

## Prerequisites

To complete this tutorial, you need to:

* Create an [IBM Cloud](https://cloud.ibm.com/login) account.
* Get an instance of [Kubernetes Service on IBM Cloud](https://cloud.ibm.com/kubernetes/catalog/cluster), which should take approximately 20 minutes.
* Access a Kubernetes Cluster through the `kubectl` CLI. To access the instructions, go to **IBM Cloud dashboard > [your cluster] > Access**.
* Create a namespace on IBM Cloud container registry. To do so, go to  your IBM Cloud dashboard and click **Navigation > Kubernetes > Registry > Namespaces**.
* Configure the [Git CLI](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git). Clone the repository to your workstation using the following command:
 
  ```
  git clone https://github.com/IBM/deploy-app-using-tekton-on-kubernetes.git
  ```
  
## Estimated time

After your prerequisites are configured, this tutorial takes about 40 minutes.

## Build and deploy an application on IBM Cloud Kubernetes Service using `kubectl`

You perform the following steps to build and deploy an application on a Kubernetes cluster.

1.	Write a Dockerfile for your application and build the container image using Dockerfile.
1. 	Upload the built container image to the accessible container registry.
1.	Create a Kubernetes deployment using the container image and deploy the application to an IBM Cloud Kubernetes Service cluster using configuration (yaml) files.

For this tutorial, we have taken a simple "Hello world!" Node.js application to deploy on Kubernetes as shown.
<!--EM: Where does this Node.js Application come from? Is that cloned from somewhere? Where does Appsody come into play here? We haven't mentioned it before. I guess I dont' really undertsand where this code is coming from.-->

```
  const app = require('express')()

  app.get('/', (req, res) => {
    res.send("Hello from Appsody!");
  });

  var port = 3300;

  var server = app.listen(port, function () {
    console.log("Server listening on " + port);
  })

  module.exports.app = app;
```

The dockerfile `Dockerfile` and the deployment configuration `deploy.yaml` is available in the [GitHub repository](https://github.com/IBM/deploy-app-using-tekton-on-kubernetes) that you cloned earlier. The steps explained in this section help you to deploy your application to cluster using CLIs.

### 1. Set up a deploy target

As a first step, you need to set the correct deploy target for the container image to upload to the accessible container registry. Depending on the region you created your cluster in, your image URL will be in the following format:

```
  <REGION_ABBREVIATION>.icr.io/<YOUR_NAMESPACE>/<YOUR_IMAGE_NAME>:<VERSION>
```

The following command tells you the Registry API endpoint for your cluster. You can get region abbreviation from the output.

```
   ibmcloud cr api
```

To get namespace use the following command.
```
   ibmcloud cr namespaces
```

For example, deploy target for US-South region will be:
```
   us.icr.io/test_namespace/builtApp:1.0
```

### 2. Deploy the application

Run the following commands to deploy your application on a Kubernetes cluster.

```
  cd ~/deploy-app-using-tekton-on-kubernetes/src
  
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

After successful deployment, your application is accessible at: 

```
  http://<public-ip-of-kubernetes-cluster>:32426/
```

where you can retrieve the public IP of a Kubernetes cluster from  your IBM Cloud dashboard and the port 32426 is defined as `nodePort` in deploy.yaml.

The steps above showed you got to deploy onto a Kubernetes cluster using CLIs. If you change your application after deployment, you need to rerun the steps again. 

In order to build, test, and deploy application faster and more reliably, you need to automate this entire workflow. Following a continuous integration and delivery (CI/CD) methodology reduces the overhead of development and manual deployment processes, which can save you significant time and effort. 

The next section of this tutorial explains the build and deploy approach using Tekton Pipelines.

## Build and deploy an application on IBM Cloud Kubernetes Service using Tekton Pipeline

[Tekton](https://github.com/tektoncd/pipeline) is a powerful and flexible Kubernetes-native open source framework for creating CI/CD systems. It allows you to build, test, and deploy across multiple cloud providers or on-premises systems by abstracting away the underlying implementation details. 

before I show you how to use Tekton Pipelines, here's a high-level overview of the concepts.

The Tekton Pipeline project extends the Kubernetes API by five additional custom resource definitions (CRDs) to define pipelines:
* A *task* is an individual job and defines a set of build steps such as compiling code, running tests, and building and deploying images.
* A *Taskrun* runs the task you defined. With taskrun, it's possible to execute a single task, which binds the inputs and outputs of the task.
* *Pipeline* describes a list of tasks that compose a pipeline.
* *Pipelinerun* defines the execution of a pipeline. It references the Pipeline to run and which PipelineResource(s) to use as input and output.
* The *Pipelineresource* defines an object that is an input (such as a Git repository) or an output (such as a Docker image) of the pipeline.

To automate the application’s build and deploy workflow using Tekton Pipelines, follow these steps:

### 1. Add the Tekton Pipelines component to your Kubernetes cluster

As a very first step, add the Tekton Pipelines to your Kubernetes cluster using following command.

```
  kubectl apply --filename https://storage.googleapis.com/tekton-releases/latest/release.yaml
```

The installation creates two pods which you can check using the following command. Wait until the pods are in running state. 

```
  kubectl get pods --namespace tekton-pipelines
```

For more information on this, refer [to the Tekton documentation](https://github.com/tektoncd/pipeline/blob/master/docs/install.md#adding-the-tekton-pipelines). After completing these steps, your Kubernetes cluster is ready to run Tekton Pipelines. Let’s start by creating the definition of custom resources.

### 2. Create Pipeline resource

In the example taken for this tutorial, the source code of the application, Dockerfile and deployment configuration is available in the [GitHub repository](https://github.com/IBM/deploy-app-using-tekton-on-kubernetes) that you cloned earlier. 

To create the input pipeline resource to access the Git repository, do the following: 

In the `git.yaml` file, define the PipelineResource for the git repository:

* Specify the resource `type` as git.
* Provide the git repository URL as `url`.
* `revision` as the name of the branch of the git repository to be used.

The complete YAML file is available at `~/tekton-pipeline/resources/git.yaml`. Apply the file to the cluster as shown.

```
  cd ~/tekton-pipeline
  kubectl apply -f resources/git.yaml
```

### 3. Create tasks

A *task* defines the steps of the pipeline. To deploy an application to a cluster using source code in the Git repository, we define two tasks &mdash; `build-image-from-source` and `deploy-to-cluster`. In task definition, the parameters used as args are referred as `$(inputs.params.<var_name>)`. <!--EM: What are "args"-->

**Define Build-image-from-source**

This task includes two steps as follows: <!--EM: Are these commands you run?-->

* `list-src` step lists the source code from the cloned repository. It is being done just to verify whether source code is cloned properly.

* `build-and-push` step builds the container image using Dockerfile and pushes the built image to the container registry. In this example `Kaniko` is used to build and push the image. There are other options also available for this purpose like buildah, podman etc. Kaniko uses the Dockerfile name, its location and destination to upload the container image as arguments.

All required parameters are passed through params. Apply the file to the cluster using following command.

```
  kubectl apply -f task/build-src-code.yaml
```

**Define Deploy-to-cluster**

Now let us deploy application in a pod using the built container image, and make it available as a service to access from anywhere. This task uses the deployment configuration located as `~/src/deploy.yaml`. This task includes two steps:

* `update-yaml` step updates the container image url in place of `IMAGE` in deploy.yaml.

* `deploy-app` step deploys the application in Kubernetes pod and expose it as a service using `~/src/deploy.yaml`. This step uses `kubectl` to create deployment configuration on Kubernetes cluster.
 
All required parameters are passed through params.

Apply the file to the cluster as: 

```
  kubectl apply -f task/deploy-to-cluster.yaml
```

### 4. Create a pipeline

A pipeline lists the tasks to be executed. It provides the input, output resources, and input parameters required by each task. If there is any dependency between the tasks, that is also addressed. 

In the `tekton-pipeline/resources/pipeline.yaml`:

* Pipeline uses the above mentioned tasks `build-image-from-source` and `deploy-to-cluster`.
* The `runAfter` key is used here because we need to execute the tasks one after the another.
* PipelineResource (git repository) is provided through the `resources` key.

All required parameters are passed through params. Parameters value are defined in pipeline as `$(params.imageUrl)` which is different than the args in task definition. Apply this configuration as:

```
  kubectl apply -f pipeline/pipeline.yaml
```

### 5. Create PipelineRun

To execute the pipeline, you need a PipelineRun resource definition. All required parameters are passed from PipelineRun. PipelineRun triggers the pipeline, and the pipeline, in turn, creates TaskRuns and so on. In a similar manner, all parameters get substituted down to the tasks. 

If a parameter is not defined in PipelineRun, then the default value gets picked up from the `params` under `spec` from the resource definition itself. For example, `pathToDockerfile` param is used in task `build-image-from-source`, but its value is not provided in `pipeline-run.yaml`. Because of this, its default value defined in `~/tekton-pipeline/build-src-code.yaml` is used during the task execution.

In the PipelineRun definition, `tekton-pipeline/pipeline/pipeline-run.yaml`:

* References the Pipeline `application-pipeline` created through `pipeline.yaml`.
* References the PipelineResource `git` to use as input.
* Provides the value of parameters under `params` which are required during the execution of pipeline and the tasks.
* Specifies a service account.

Note that through the pipeline, you can push images to the registry and deploy it to a cluster. So, you need to ensure that it has the sufficient privileges to access the container registry and the cluster. The credentials for the registry are provided by a ServiceAccount. So, you need to define a service account before executing Pipelinerun.

> Note: Do not apply the PipelineRun file yet because you still need to define the service account for it.

### 6. Create a service account

To access the protected resources, set up a service account which uses secrets to create or modify Kubernetes resources. IBM Cloud Kubernetes Service is configured to use IBM Cloud Identity and Access Management (IAM) roles. These roles determine the actions that users can perform on IBM Cloud Kubernetes. 

**Generate an API key**

To generate an API key using IBM Cloud Dashboard, follow the instructions in the [IBM Cloud documentation](https://cloud.ibm.com/docs/iam?topic=iam-userapikey#create_user_key). You can also use the following CLI command to create API key.

```
  ibmcloud iam api-key-create MyKey -d "this is my API key" --file key_file.json
  cat key_file.json | grep apikey
```

Copy the `apikey`. You will use it in the next step.

**Create secrets**

To create a secret, use the following code. <APIKEY> is the one that you created and <REGISTRY> is the registry API endpoint for your cluster; for example, us.icr.io.
  
```
  kubectl create secret generic ibm-cr-secret --type="kubernetes.io/basic-auth" --from-literal=username=iamapikey --from-literal=password=<APIKEY>

  kubectl annotate secret ibm-cr-secret tekton.dev/docker-0=<REGISTRY>
``` 

It creates a secret named as `ibm-cr-secret` which will be used in the configuration file for the service account.

In the configuration file, `tekton-pipeline/pipeline/service-account.yaml`:

* The `ServiceAccount` resource uses the secret generated above `ibm-cr-secret`.
* As per the definition of a secret resource, the newly built secret is populated with an API token for the service account. 
* The next step is to define roles. A Role can only be used to grant access to resources within a single namespace. Include appropriate resources and apiGroups in rules without which it fails with access issues.
* A role binding grants the permissions defined in a role to a user or set of users. It holds a list of subjects (users, groups, or service accounts), and a reference to the role being granted. 

Apply this configuration as:

```
  kubectl apply -f pipeline/service-account.yaml
```
### 7.Execute the Pipeline

Before executing Pipelinerun, modify `imageUrl` and `imageTag` in `tekton-pipeline/pipeline/pipelinerun.yaml`. Refer to the `Setup Deploy Target` section above to decide on an image URL and tag. If imageURL is *us.icr.io/test_namespace/builtApp* and image tag is *1.0*, then update configuration file as:

```
  sed -i '' s#IMAGE_URL#us.icr.io/test_namespace/builtApp# pipeline/pipelinerun.yaml
  sed -i '' s#IMAGE_TAG#1.0# pipeline/pipelinerun.yaml
```

Now, create the pipelinerun configuration.

```
  kubectl create -f pipeline/pipeline-run.yaml
```

It will create pipeline with a below message on terminal.

```
  pipelinerun.tekton.dev/application-pipeline-run created
```

To check the status of the pipeline created:

```
  kubectl describe pipelinerun application-pipeline-run
```

You may need to rerun this command based on the status. It shows the interim status as:<!--EM: I'm confused about this use of HTML in this following listing and the ones below. Should be in a code listing to show that it's output? Am I misunderstanding what exactly this is?-->

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

Once the execution of your pipeline is complete, you should see the following as an output of the `describe` command:

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


In case of failure, it shows which task has failed. It also gives you the additional details to check logs. To know more details about a resource, for instance, "pipeline", use the `kubectl describe` command to get information.

```
  kubectl describe <resource> <resource-name>
```

### 8. Verify your results

To verify whether the pod and service is running as expected, check the output of the following commands.

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

After successful execution of `pipelinerun`, the application is accessible at:
```
  http://<public-ip-of-kubernetes-cluster>:32426/
```
where you can retrieve the public IP of your Kubernetes cluster from your IBM Cloud dashboard, and the port 32426 is defined as nodePort in `deploy.yaml`.

In this way, you deploy your application using Tekton Pipeline. This tutorial covers the basics of Tekton Pipeline to get you started on building your own pipelines. There are more features available like webhooks, web-based dashboards. Do try it out with IBM Cloud Kubernetes Service.

## Next steps

Tekton is one of the tools available in the open source project Kabanero. [Kabanero](https://kabanero.io/) brings together key technologies into a microservices-based framework for building modern cloud-native applications. Kabanero has Codewind which helps to build cloud-native applications, Appsody which helps to build and deploy cloud-native applications and Tekton which is Kubernetes style CI/CD pipeline. Each project has its own open source community and independent releases. The Kabanero open source project is included within [IBM Cloud Pak for Applications](https://cloud.ibm.com/catalog/content/ibm-cp-applications) as Kabanero Enterprise. The Cloud Pak for Applications provides a faster, more secure way to move your business applications to cloud, in container enabled environment. Cloud Pak for Applications is built and supported on Red Hat OpenShift. Explore and try out with the help of this [developer guide](https://developer.ibm.com/series/developers-guide-to-ibm-cloud-pak-for-applications/).


## Related links
* [Deploy a Knative application using Tekton-Pipelines](https://developer.ibm.com/tutorials/knative-build-app-development-with-tekton/)
* [Codewind + Appsody + Tekton = Easier Cloud-Native Development](https://www.ibm.com/cloud/blog/codewind-appsody-tekton-means-easier-cloud-native-development)
* [Kabanero: Development tools and runtimes powering IBM Cloud Pak for Applications](https://www.ibm.com/cloud/blog/kabanero-microservices-cloud-native-apps-faster)
* [Codewind Tutorial](https://developer.ibm.com/tutorials/develop-a-cloud-native-java-application-using-codewind/)
* [Appsody Overview](https://developer.ibm.com/articles/customizing-appsody/)


