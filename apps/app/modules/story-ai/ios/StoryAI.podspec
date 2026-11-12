Pod::Spec.new do |s|
  s.name           = 'StoryAI'
  s.version        = '1.0.0'
  s.summary        = 'Describe a layout for StoryStitch, with the on-device Apple Intelligence language model.'
  s.description    = 'Turns a short description into a layout spec on the device. Nothing is sent anywhere.'
  s.author         = 'StoryStitch'
  s.homepage       = 'https://storystitch.ashishnag.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
